/* eslint-disable prefer-template */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
import { randomUUID } from "crypto";
import { ChangeType, IMiBranchStorage, IMiChange, IMiChangeset, IMiVersion } from "./interfaces";
import { cloneMap, deserializeChange, deserializeNestedMap, IMiBranchChange,
    IMiUndoChange, serializeNestedMap } from ".";

export const MI_BRANCH_PREFIX = "Branch_";

export class MiChange implements IMiChange {
    private readonly _type: ChangeType;
    private readonly _change: Map<string,any>;

    constructor(type: ChangeType, change: Map<string,any>) {
        this._type = type;
        this._change = change;
    }

    public get type(): ChangeType {
        return this._type;
    }

    public get change(): Map<string,any> {
        return cloneMap(this._change);
    }

    public clone() {
        return new MiChange(this._type, cloneMap(this._change));
    }

    public miSerialize(): string {
        const obj = {myClass: "MiChange", myType: this.type, myChange: serializeNestedMap(this.change)};
        return JSON.stringify(obj);
    }

    public static miDeserialize(str: string): MiChange {
        const obj = JSON.parse(str);
        if(obj.myClass === "MiChange") {
            const myChange = deserializeNestedMap(obj.myChange);
            return new MiChange(obj.myType, myChange);
        }
        else {
            throw Error("Invalid class: " + obj.myClass);
        }
    }
}

export class MiUndoChange extends MiChange implements IMiUndoChange {
    private readonly _toVersion: IMiVersion;
    private readonly _hash: number = Math.random();
    constructor(toVersion: IMiVersion) {
        super(ChangeType.Undo, new Map<string,any>());
        this._toVersion = toVersion;
    }

    public get toVersion(): IMiVersion {
        return this._toVersion;
    }

    public miSerialize(): string {
        const obj = {myClass: "MiUndoChange",myToVersion: this._toVersion, myHash: this._hash};
        return JSON.stringify(obj);
    }

    public static miDeserialize(str: string): MiChange {
        const obj = JSON.parse(str);
        if(obj.myClass === "MiUndoChange") {
            const toVersion = new MiVersion(obj.myToVersion._branch, obj.myToVersion._offset);
            return new MiUndoChange(toVersion);
        }
        else {
            throw Error("Invalid class: " + obj.myClass);
        }
    }

    public clone() {
        return new MiUndoChange(this._toVersion);
    }
}

export class MiBranchChange extends MiChange implements IMiBranchChange {
    private readonly _fromVersion: IMiVersion;
    private readonly _branch: string;

    constructor(fromVersion: IMiVersion, branch: string | undefined) {
        super(ChangeType.Branch, new Map<string,any>());
        this._fromVersion = fromVersion;
        if(branch === undefined) {
            const myRandom = randomUUID();
            this._branch = MI_BRANCH_PREFIX + myRandom;
        }
        else {
            this._branch = branch;
        }
    }

    public get fromVersion(): IMiVersion {
        return this._fromVersion;
    }

    public get branch(): string {
        return this._branch;
    }

    public miSerialize(): string {
        const obj = {myClass: "MiBranchChange",myFromVersion: this._fromVersion, myBranch: this._branch};
        return JSON.stringify(obj);
    }

    public static miDeserialize(str: string): MiChange {
        const obj = JSON.parse(str);
        if(obj.myClass === "MiBranchChange") {
            const fromVersion = new MiVersion(obj.myFromVersion._branch, obj.myFromVersion._offset);
            return new MiBranchChange(fromVersion,obj.myBranch);
        }
        else {
            throw Error("Invalid class: " + obj.myClass);
        }
    }

    public clone() {
        return new MiBranchChange(this._fromVersion, this._branch);
    }
}

export class MiChangeset implements IMiChangeset {
    private readonly _fromVersion: IMiVersion;
    private readonly _toVersion: IMiVersion;
    private readonly _changes: IMiChange[];
    private readonly _inverse: IMiChange[];

    constructor(fromVersion: IMiVersion, toVersion: IMiVersion,changes: IMiChange[],inverse: IMiChange[]) {
        this._fromVersion = fromVersion;
        this._toVersion = toVersion;
        this._changes = changes;
        this._inverse = inverse;
    }

    public get fromVersion(): IMiVersion {
        return this._fromVersion;
    }

    public get toVersion(): IMiVersion {
        return this._toVersion;
    }

    public get changes(): IMiChange[] {
        return this._changes;
    }

    public get inverse(): IMiChange[] {
        return this._inverse;
    }

    public miSerialize(): string {
        const obj = this.generateObjectToSerialize();
        return JSON.stringify(obj);
    }

    protected generateObjectToSerialize(): any {
        return {
            myFromVersion: this.fromVersion, myToVersion: this.toVersion,
            myClass: "MiChangeset",
            myChanges: this.changes.map((change) => change.miSerialize()),
            myInverse: this.inverse.map((change) => change.miSerialize()),
        };
    }

    public static miDeserialize(str: string): MiChangeset {
        const obj = JSON.parse(str);
        if(obj.myClass === "MiChangeset") {
            const myChanges = (obj.myChanges as string[]).map((cstr) => deserializeChange(cstr));
            const myInverse =  (obj.myInverse as string[]).map((cstr) => deserializeChange(cstr));
            const fromVersion = new MiVersion(obj.myFromVersion._branch, obj.myFromVersion._offset);
            const toVersion = new MiVersion(obj.myToVersion._branch, obj.myToVersion._offset);
            return new MiChangeset(fromVersion, toVersion, myChanges, myInverse);
        }
        else {
            throw Error("Invalid class: " + obj.myClass);
        }
    }
}

export class MiBranchStorage implements IMiBranchStorage {
    private readonly _branch: string;
    private _changesets: IMiChangeset[];
    private _branchOrigin: IMiVersion | undefined;

    constructor(branch: string) {
        this._branch = branch;
        this._changesets = [];
    }

    public get branch(): string {
        return this._branch;
    }
    public addChangeset(changeset: IMiChangeset): void {
        this._changesets.push(changeset);
    }

    public getLatestIndex(): number {
        return this._changesets.length - 1;
    }

    public getChangeset(index: number): IMiChangeset | undefined {
        return this._changesets[index];
    }

    public getLatestVersion(): IMiVersion | undefined {
        const changeset = this._changesets[this.getLatestIndex()];
        if(changeset === undefined) {return undefined;}
        return changeset.toVersion;
    }

    public setChangesets(changesets: IMiChangeset[]): void {
        this._changesets = changesets;
    }

    public setBranchOrigin(branchOrigin: IMiVersion): void {
        this._branchOrigin = branchOrigin;
    }

    public getBranchOrigin() {
        return this._branchOrigin;
    }

    public miSerialize(): string {
        const obj = {myBranch: this.branch,
            myClass: "MiBranchStorage",
            myChangesets: this._changesets.map((changeset) => changeset.miSerialize()),
            myBranchOrigin: this._branchOrigin?.miSerialize(),
        };
        return JSON.stringify(obj);
    }

    public static miDeserialize(str: string): MiBranchStorage {
        const obj = JSON.parse(str);
        if(obj.myClass === "MiBranchStorage") {
            const myBranch = obj.myBranch;
            const myChangesets =  (obj.myChangesets as string[]).map((cstr) => MiChangeset.miDeserialize(cstr));
            const sto: MiBranchStorage = new MiBranchStorage(myBranch);
            sto.setChangesets(myChangesets);
            if(obj.myBranchOrigin !== undefined) {
                sto.setBranchOrigin(MiVersion.miDeserialize(obj.myBranchOrigin));
            }
            return sto;
        }
        else {
            throw Error("Invalid class: " + obj.myClass);
        }
    }
}

export class MiVersion implements IMiVersion {
    private readonly _branch: string;
    private readonly _offset: number;

    constructor(branch: string, offset: number) {
        this._branch = branch;
        this._offset = offset;
    }

    public get branch(): string {
        return this._branch;
    }

    public get offset(): number {
        return this._offset;
    }

    public miSerialize(): string {
        return JSON.stringify({myOffset: this._offset, myBranch: this._branch});
    }

    public static miDeserialize(str: string): IMiVersion {
        const obj = JSON.parse(str);
        return new MiVersion(obj.myBranch, obj.myOffset);
    }
}
