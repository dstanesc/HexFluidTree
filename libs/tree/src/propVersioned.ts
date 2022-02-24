/* eslint-disable prefer-template */

import { IChannelFactory, IChannelStorageService, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
// import { readAndParse } from "@fluidframework/driver-utils";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary, IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";
import { MiBranchStorage, MiChange, MiChangeset, MiVersion } from "./change";
import {
    ChangeType, IMiBranchStorage, IMiChange, IMiChangeset, IMiVersion,
    ISharedMiPropVersioned, ISharedMiPropVersionedEvents, IMiUndoChange,
} from "./interfaces";
import {
    applyChanges, deleteChange, extractProperties,
    mergeChangeToMap, navigatePath, PropDetails, setChange,
    deserializeNestedMap, serializeNestedMap,
} from "./propUtil";
import { MiPropFactoryVersioned } from "./propVersionedFactory";
import { cloneMap, deserializeChange, IMiBranchChange, serializeChange } from ".";

interface IMiPropOperation {
    type: "miChange";
    value: IMiChangeValue;
}

interface IMiChangeValue {
    valueBranch: string;
    value: any;
}

export class SharedMiPropVersioned extends SharedObject<ISharedMiPropVersionedEvents>
    implements ISharedMiPropVersioned {
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, MiPropFactoryVersioned.Type) as SharedMiPropVersioned;
    }

    public static getFactory(): IChannelFactory {
        return new MiPropFactoryVersioned();
    }

    private branches: Map<string,IMiBranchStorage> = new Map();
    private branchHeads: Map<string,Map<string,any>> = new Map();
    private readonly snapshotFileName = "branchdetails";
    private _localVersion: IMiVersion | undefined;
    private _localBase: IMiVersion | undefined;

    public get localVersion(): IMiVersion | undefined {
        return this._localVersion;
    }

    public set localVersion(localVersion: IMiVersion | undefined)  {
        this._localVersion = localVersion;
    }

    public get localBase(): IMiVersion | undefined {
        return this._localBase;
    }

    public set localBase(localBase: IMiVersion | undefined)  {
        this._localBase = localBase;
    }

    public push(branch: string, changeRequests: IMiChange[]): void {
        const operationValue: IMiChangeValue = {
            valueBranch: branch,
            value: this.encodeChange(changeRequests),
        };
        const op: IMiPropOperation = {
            type: "miChange",
            value: operationValue,
        };
        this.submitLocalMessage(op);
    }

    private encodeChange(changeRequests: IMiChange[]): any {
        const preSerialized = changeRequests.map((change) => serializeChange(change));
        return this.serializer.encode(preSerialized, this.handle);
    }

    private decodeChange(serialized: any): IMiChange[] {
        const deserialized: [] = this.serializer.decode(serialized);
        const postDeserialized: IMiChange[] = deserialized.map((str)=>deserializeChange(str));
        return postDeserialized;
    }

    private processChangePack(branch: string, changes: IMiChange[]): IMiChangeset | undefined {
        const containsNonBranch: boolean = this.applyBranchChanges(changes);
        if(containsNonBranch) {
            const changeset: IMiChangeset = this.computeChangset(branch, changes);
            const branchStorage = this.getOrCreateBranchStorage(branch);
            branchStorage.addChangeset(changeset);
            applyChanges(changeset.changes,this.getOrCreateBranchHead(branch));
            return changeset;
        }
        else {
            return undefined;
        }
    }

    private getOrCreateBranchHead(branch: string): Map<string, any>  {
        let branchHead = this.branchHeads.get(branch);
        if (branchHead === undefined) {
            branchHead = new Map<string, any>();
            this.branchHeads.set(branch, branchHead);
        }
        return branchHead;
    }

    private getOrCreateBranchHeadClone(branch: string): Map<string, any>  {
        return cloneMap(this.getOrCreateBranchHead(branch));
    }

    private getOrCreateBranchStorage(branch: string): IMiBranchStorage {
        let branchStorage = this.branches.get(branch);
        if (branchStorage === undefined) {
            branchStorage = new MiBranchStorage(branch);
            this.branches.set(branch, branchStorage);
        }
        return branchStorage;
    }

    private createBranchHead(newBranch: string, fromVersion: IMiVersion) {
        const myMap = this.getOrCreateBranchHeadClone(fromVersion.branch);
        const fromBranchStorage = this.getOrCreateBranchStorage(fromVersion.branch);
        const latestFromVersion = fromBranchStorage.getLatestVersion();
        if(latestFromVersion) {
            const changeset = this.getSummary(fromVersion.branch ,latestFromVersion, fromVersion);
            if(changeset) {
                applyChanges(changeset.changes,myMap);
            }
        }
        this.branchHeads.set(newBranch, myMap);
    }

    private applyBranchChanges(changes: IMiChange[]) {
        let containsNonBranch = false;
        changes.forEach((ch) => {
            if(ch.type === ChangeType.Branch) {
                const branchChange = ch as IMiBranchChange;
                if(!this.branches.has(branchChange.branch)) {
                    const sto: IMiBranchStorage = this.getOrCreateBranchStorage(branchChange.branch);
                    sto.setBranchOrigin(branchChange.fromVersion);
                    this.createBranchHead(branchChange.branch, branchChange.fromVersion);
                }
            }
            else{
                containsNonBranch = true;
            }
        });
        return containsNonBranch;
    }

    private expandChanges(branch: string,currentVersion: IMiVersion, changes: IMiChange[]): IMiChange[] {
        const expandedChanges: IMiChange[] = [];
        changes.forEach((ch) => {
            if(ch.type === ChangeType.Undo) {
                const undo = ch as IMiUndoChange;
                this.getSummary(branch, currentVersion, undo.toVersion)?.changes
                .forEach((ch2) => expandedChanges.push(ch2.clone()));
            }
            else if(ch.type === ChangeType.Branch) {}
            else{
                expandedChanges.push(ch);
            }
        });
        return expandedChanges;
    }

    private computeChangset(branch: string, changes: IMiChange[]): IMiChangeset {
        const branchStorage = this.getOrCreateBranchStorage(branch);
        const latestIndex: number = branchStorage.getLatestIndex();
        const fromVersion = new MiVersion(branch, latestIndex);
        const toVersion = new MiVersion(branch, latestIndex + 1);
        const expandedChanges = this.expandChanges(branch, fromVersion,changes);
        const inverse: IMiChange[] =  this.computeInverse(branch, expandedChanges, latestIndex);
        const changeset: IMiChangeset = new MiChangeset(fromVersion,toVersion,expandedChanges,inverse);
        return changeset;
    }

    private computeInverse(branch: string, changes: IMiChange[], lastIndex: number): IMiChange[] {
        const inverseDeleteChange: Map<string, any> = new Map();
        const inverseSetChange: Map<string, any> = new Map();
        const inverse: IMiChange[] = [];
        const reversed = [... changes];
        reversed.reverse().forEach((change) => {
            switch(change.type) {
                case ChangeType.Set: {
                    this.computeSetInverse(branch,change,inverseDeleteChange,inverseSetChange);
                    break;
                }
                case ChangeType.Delete: {
                    this.computeDeleteInverse(branch,change,inverseDeleteChange,inverseSetChange);
                    break;
                }
                default: {
                    throw new Error("Unknown Change Type " + change.type);
                }
            }
        });
        if(inverseDeleteChange.size > 0) {
            inverse.push(new MiChange(ChangeType.Delete,inverseDeleteChange));
        }
        if(inverseSetChange.size > 0) {
            inverse.push(new MiChange(ChangeType.Set,inverseSetChange));
        }
        return inverse;
    }

    private computeSetInverse(branch: string, setChangeArg: IMiChange,
        inverseDeleteChange: Map<string, any>, inverseSetChange: Map<string, any>): void {
        const afterChange: PropDetails[] = extractProperties(setChangeArg.change);
        afterChange.forEach((value) => {
            const branchHead = this.getOrCreateBranchHeadClone(branch);
            const inPath: Map<string, any> | any | undefined = navigatePath(branchHead, value._path, false);
            if(inPath === undefined) {
                mergeChangeToMap(deleteChange(value.path).change,inverseDeleteChange);
            }
            else{
                mergeChangeToMap(setChange(value.path,inPath).change,inverseSetChange);
            }
        });
    }

    private computeDeleteInverse(branch: string, deleteChangeArg: IMiChange,
        inverseDeleteChange: Map<string, any>, inverseSetChange: Map<string, any>): void {
        const afterChange: PropDetails[] = extractProperties(deleteChangeArg.change);
        afterChange.forEach((value) => {
            const branchHead = this.getOrCreateBranchHead(branch);
            const inPath: Map<string, any> | any | undefined = navigatePath(branchHead, value._path, false);
            if(inPath !== undefined) {
                mergeChangeToMap(setChange(value.path,inPath).change,inverseSetChange);
            }
        });
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (message.type === MessageType.Operation) {
            const op = message.contents as IMiPropOperation;
            switch (op.type) {
                case "miChange": {
                    const myData: IMiChange[] = this.decodeChange(op.value.value);
                    const changeset = this.processChangePack(op.value.valueBranch, myData);
                    if(changeset !== undefined) {
                        this.emit("changesetApplied", changeset);
                    }
                    else {
                        console.log("MISO70 EMIT branchAdded");
                        this.emit("branchAdded");
                    }
                    break;
                }
                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    public getHeadVersion(branch: string): IMiVersion | undefined {
        return this.getOrCreateBranchStorage(branch).getLatestVersion();
    }

    public getSummary(branch: string, fromVersion: IMiVersion, toVersion: IMiVersion): IMiChangeset | undefined {
        if(fromVersion.branch !== toVersion.branch) {
            throw Error("Unsupported summary between 2 branches! " + fromVersion.branch + " : " + toVersion.branch);
        }
        if(fromVersion.offset > toVersion.offset) {
            return this.gestSummaryDown(branch,fromVersion,toVersion);
        }
        else {
            return this.gestSummaryUp(branch,fromVersion,toVersion);
        }
    }

    private mapChangeset(branch: string, index: number): IMiChangeset | undefined  {
        const branchStorage = this.getOrCreateBranchStorage(branch);
        if(index < 0) {
            const originVersion = branchStorage.getBranchOrigin();
            if(originVersion === undefined) {return undefined;}
            const newIndex = originVersion?.offset + index + 1;
            return this.mapChangeset(originVersion.branch, newIndex);
        }
        else {
            return branchStorage.getChangeset(index);
        }
    }

    private gestSummaryUp(branch: string, fromVersion: IMiVersion, toVersion: IMiVersion): IMiChangeset | undefined {
        let allChanges: IMiChange[] = [];
        let allInverse: IMiChange[] = [];
        for(let i = fromVersion.offset + 1; i <= toVersion.offset; i++) {
            const changeset = this.mapChangeset(branch,i);
            if(changeset === undefined) {return undefined;}
            allChanges = [... allChanges, ... changeset.changes];
            allInverse = [... allInverse, ... changeset.inverse];
        }
        return new MiChangeset(fromVersion, toVersion, allChanges, allInverse);
    }

    private gestSummaryDown(branch: string, fromVersion: IMiVersion, toVersion: IMiVersion): IMiChangeset | undefined {
        let allChanges: IMiChange[] = [];
        let allInverse: IMiChange[] = [];
        for(let i = fromVersion.offset; i > toVersion.offset; i--) {
            const changeset = this.mapChangeset(branch,i);
            if(changeset === undefined) {return undefined;}
            allChanges = [... allChanges, ... changeset.inverse];
            allInverse = [... allInverse, ... changeset.changes];
        }
        return new MiChangeset(fromVersion, toVersion, allChanges, allInverse);
    }

    public createBranch(name: string, fromVersion: IMiVersion): void {
        throw Error("Unsupported method! Branches are not supported!");
    }

    public getHeadSummary(branch: string): IMiChangeset {
        const head = this.getOrCreateBranchHeadClone(branch);
        const latestIndex = this.getOrCreateBranchStorage(branch).getLatestIndex();
        const fromVersion = new MiVersion(branch,-1);
        const toVersion = new MiVersion(branch,latestIndex);
        const changes = [new MiChange(ChangeType.Set, head)];
        const inverse = Array.from(head.keys()).map((key: string) => {
            const del = new Map<string,any>();
            del.set(key,"");
            return new MiChange(ChangeType.Delete,del);
        });
        const changeset = new MiChangeset(fromVersion, toVersion, changes, inverse);
        return changeset;
    }

    protected applyStashedOp() {
        throw new Error("not implemented");
    }

    protected registerCore() {
    }

    private serializeCore(): string {
        const branchObj = Array.from(this.branches).map((arr) => [arr[0], arr[1].miSerialize()]);
        const headObj = Array.from(this.branchHeads).map((arr) => [arr[0], serializeNestedMap(arr[1])]);
        return JSON.stringify([branchObj, headObj]);
    }

    private deserializeCore(str: string): void {
        const arr = JSON.parse(str);
        const branchObj: string[] = arr[0];
        const headObj: string[]  = arr[1];
        this.branches = new Map(branchObj.map((arrb) => [arrb[0],MiBranchStorage.miDeserialize(arrb[1])]));
        this.branchHeads = new Map(headObj.map((arrb) => [arrb[0],deserializeNestedMap(arrb[1])]));
    }

    protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
        const serialized = this.serializeCore();
        return createSingleBlobSummary(this.snapshotFileName, serializer.stringify(serialized, this.handle));
    }

    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const content = await readAndParse<string>(storage, this.snapshotFileName);
        this.deserializeCore(content);
        this.emit("coreLoaded");
    }
    protected onDisconnect() {}

    public listBranches(): string[] {
        return Array.from(this.branches.keys());
    }
}
