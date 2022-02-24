/* eslint-disable prefer-template */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { MiChange} from "./change";
import { ChangeType, IMiChange } from "./interfaces";
import { IMiVersion, ISharedMiPropVersioned, MiBranchChange, MiUndoChange } from ".";

export function setChange(path: string[], value: any): IMiChange {
    const propHolder: Map<string,any> = new Map();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const inPath: Map<string,any> = navigatePath(propHolder, path.slice(0,path.length - 1), true)!;
    inPath.set(path[path.length - 1],value);
    return new MiChange(ChangeType.Set,propHolder);
}

export function addPathChange(path: string[]): IMiChange {
    return setChange(path,new Map<string,any>());
}

export function deleteChange(path: string[]): IMiChange  {
    const propHolder: Map<string,any> = new Map();
    navigatePath(propHolder,path,true);
    return new MiChange(ChangeType.Delete,propHolder);
}

export function mergeChanges(change1: Map<string,any>, change2: Map<string,any>): Map<string,any> {
    const propHolder: Map<string,any> = cloneMap(change1);
    return mergeChangeToMap(change2, propHolder);
}

export function mergeChangeToMap(change: Map<string, any>, toMap: Map<string, any>) {
    const props2: PropDetails[] = extractProperties(change);
    props2.forEach((value) => {
        const path: string[] = value.path;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const inPath: Map<string, any> = navigatePath(toMap, path.slice(0, path.length - 1), true)!;
        inPath.set(path[path.length - 1], value.value);
    });
    return toMap;
}

export function  navigatePath(top: Map<string,any>, path: string[], isCreate: boolean):
     Map<string,any> | any | undefined {
    let inpath = top;
    for(let i = 0; i < path.length; i++) {
        if(inpath === undefined) {break;}
        if(inpath instanceof Map) {
            const prevInpath: Map<string,any> = inpath;
            inpath = inpath?.get(path[i]);
            if(inpath === undefined) {
                if(isCreate) {
                    inpath = new Map<string, any>();
                    prevInpath.set(path[i],inpath);
                }
                else {
                    return undefined;
                }
            }
        }
        else {
            if(i === path.length - 1) {
                return inpath;
            }
            else {
                return undefined;
            }
        }
    }
    return inpath;
}

export class PropDetails {
    _path: string[];
    _value: any;

    constructor(path: string[],value: any) {
        this._path = path;
        this._value = value;
    }

    public get path(): string[] {return this._path;}
    public get value(): any {return this._value;}
}

export function extractProperties(map: Map<string,any>): PropDetails[] {
    const props: PropDetails[] = [];
     props.push(... drillDownPath([],map));
    return props;
}

function drillDownPath(path: string[], inpath: Map<string,any>): PropDetails[] {
    const props: PropDetails[] = [];
    inpath.forEach((value,key) => {
        const currentPath = [... path,key];
        const val = inpath.get(key);
        if(val instanceof Map) {
            if(val.size < 1) {
                props.push(new PropDetails(currentPath,val));
            }
            else {
                props.push(... drillDownPath(currentPath,val));
            }
        }
        else{
            props.push(new PropDetails(currentPath,val));
        }
    });
    return props;
}

export function applyChanges(changes: IMiChange[], map: Map<string,any>) {
    changes.forEach((change)=>{
        applyDeleteChange(change,map);
        applySetChange(change,map);
    });
}

function applyDeleteChange(change: IMiChange, map: Map<string,any>) {
    if(change.type === ChangeType.Delete) {
        extractProperties(change.change).forEach((propDetail) => {
            const path = propDetail.path;
            const inpath = navigatePath(map,path.slice(0,path.length - 1),false);
            if(inpath !== undefined) {
                if(inpath instanceof Map) {
                    (inpath as Map<string,any>).delete(path[path.length - 1]);
                }
            }
        });
    }
}

function applySetChange(change: IMiChange, map: Map<string,any>) {
    if(change.type === ChangeType.Set) {
        extractProperties(change.change).forEach((propDetail) => {
            const path = propDetail.path;
            const inpath: Map<string,any> = navigatePath(map,path.slice(0,path.length - 1),true);
            if(propDetail.value instanceof Map) {
                const presentVal = inpath.get(path[path.length - 1]);
                if(!(presentVal instanceof Map)) {
                    inpath.set(path[path.length - 1],propDetail.value);
                }
            }
            else {
                inpath.set(path[path.length - 1],propDetail.value);
            }
        });
    }
}

export function serializeToArray(map: Map<string,any>): any[] {
    const str: any[] = [];
    map.forEach((value, key)=>
        {
            if(value instanceof Map) {
                str.push([key,serializeToArray(value as Map<string,any>)]);
            }
            else{
                str.push([key,value]);
            }
        },
    );

    return str;
}

export function deserializeFromArray(arr: any[]): Map<string,any> {
    const map: Map<string,any> = new Map();
    if(arr.length === 2 && !Array.isArray(arr[0])) {
        if(!Array.isArray(arr[1])) {
            map.set(arr[0],arr[1]);
        }
        else if(Array.isArray(arr[1])) {
            map.set(arr[0], deserializeFromArray(arr[1]));
        }
    }
    else{
        arr.forEach((value,index)=> {
            deserializeFromArray(value as any[]).forEach((value2,key)=>{
                map.set(key,value2);
            },
            );
        },
        );
    }
    return map;
}

export function serializeNestedMap(map: Map<string,any>): string {
    const serializedMap: string = JSON.stringify(serializeToArray(map));
    return serializedMap;
}

export function  deserializeNestedMap(serializedMap: string): Map<string,any> {
    if(serializedMap.length > 0) {
        return deserializeFromArray(JSON.parse(serializedMap));
    }
    else{
        return new Map();
    }
}

export function  createPathChanges(top: Map<string,any>, path: string[]):
     IMiChange[] {
     const changeList: IMiChange[] = [];
    let inpath = top;

    for(let i = 0; i < path.length; i++) {
        if(inpath instanceof Map) {
            inpath = inpath?.get(path[i]);
            if(inpath === undefined) {
                    inpath = new Map<string, any>();
                    changeList.push(addPathChange(path.slice(0,i + 1)));
            }
        }
    }
    return changeList;
}

export function setDirect(branch: string,
    sharedProp: ISharedMiPropVersioned, path: string[], value: any): void {
    sharedProp.push(branch, [setChange(path,value)]);
}

export function addPathDirect(branch: string,sharedProp: ISharedMiPropVersioned, path: string[]): void {
    sharedProp.push(branch, [addPathChange(path)]);
}

export function deleteDirect(branch: string, sharedProp: ISharedMiPropVersioned, path: string[]): void  {
    sharedProp.push(branch, [deleteChange(path)]);
}

export function serializeChange(change: IMiChange): string {
    return change.miSerialize();
}

export function deserializeChange(str: string): IMiChange {
    const obj = JSON.parse(str);
    switch(obj.myClass) {
        case "MiChange": return MiChange.miDeserialize(str); break;
        case "MiUndoChange": return MiUndoChange.miDeserialize(str); break;
        case "MiBranchChange": return MiBranchChange.miDeserialize(str); break;
        default: throw new Error(`Unknown Change class: ${   obj.myClass}`);
    }
}

export function cloneMap(map: Map<string,any>): Map<string,any> {
    return deserializeNestedMap(serializeNestedMap(map));
}

export function compareVersions(ver1: IMiVersion, ver2: IMiVersion) {
    return ver1.branch === ver2.branch && ver1.offset === ver2.offset;
}
