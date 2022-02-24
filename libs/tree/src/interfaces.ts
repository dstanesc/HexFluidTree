import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

export interface ISharedMiPropVersionedEvents extends ISharedObjectEvents {
    (event: "valueChanged", listener: (path: string[],value: any) => void);
}

export interface IMiSerializable {
    miSerialize(): string;
}

export interface IMiVersion extends IMiSerializable{
    branch: string;
    offset: number;
}

export interface IMiChangeset extends IMiSerializable{
    fromVersion: IMiVersion;
    toVersion: IMiVersion;
    changes: IMiChange[];
    inverse: IMiChange[];
}

export enum ChangeType {
  Set = "Set",
  Delete = "Delete",
  Undo = "Undo",
  Branch = "Branch",
}

export interface IMiChange extends IMiSerializable{
    type: ChangeType;
    change: Map<string,any>;
    clone(): IMiChange;
}

export interface IMiUndoChange extends IMiChange{
    toVersion: IMiVersion;
}

export interface IMiBranchChange extends IMiChange{
    fromVersion: IMiVersion;
    branch: string;
}

export interface IMiBranchStorage  extends IMiSerializable{
    branch: string;
    addChangeset(changeset: IMiChangeset): void;
    getLatestIndex(): number;
    getChangeset(index: number): IMiChangeset | undefined;
    getLatestVersion(): IMiVersion | undefined;
    getBranchOrigin(): IMiVersion | undefined ;
    setBranchOrigin(fromVersion: IMiVersion);
}

export interface ISharedMiPropVersioned extends ISharedObject<ISharedMiPropVersionedEvents> {
    getHeadVersion(branch: string): IMiVersion | undefined;
    getSummary(branch: string, fromVersion: IMiVersion, toVersion: IMiVersion): IMiChangeset | undefined;
    push(branch: string, changes: IMiChange[]): void;
    createBranch(name: string, fromVersion: IMiVersion): void;
    getHeadSummary(branch: string): IMiChangeset | undefined;
    listBranches(): string[];
    localVersion: IMiVersion | undefined;
}
