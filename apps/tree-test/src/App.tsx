/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable prefer-template */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import React from "react";
import {
    addPathDirect, applyChanges, compareVersions, IMiChangeset,
    MiVersion, setDirect, SharedMiPropVersioned, IMiChange, MiUndoChange, MiBranchChange, setChange
}
    from "@hexfluid/tree";

let isCreate: boolean = false;

const MASTER_BRANCH = "master";
const BRANCH_SELECT_NAME = "Select Branch";
const BRANCH_SELECT_ID = "selectBranch";
const BRANCH_INPUT_ID = "newBranchId";
let branch = MASTER_BRANCH;

const getFluidData = async () => {
    const client = new TinyliciousClient();
    const containerSchema = {
        initialObjects: { propMap: SharedMiPropVersioned },
    };
    let container;
    const containerId = window.location.hash.substring(1);
    if (!containerId) {
        ({ container } = await client.createContainer(containerSchema));
        const id = await container.attach();
        window.location.hash = id;
        isCreate = true;
    } else {
        ({ container } = await client.getContainer(containerId, containerSchema));
    }
    return container.initialObjects.propMap;
};

function genPathInputId(path: string[]) {
    return "CellInput+" + JSON.stringify(path);
}

function getColor(value: number): string {
    const modulo = value % 10;
    switch (modulo) {
        case 0: { return "black"; }
        case 1: { return "blue"; }
        case 2: { return "red"; }
        case 3: { return "yellow"; }
        case 4: { return "darkcyan"; }
        case 5: { return "firebrick"; }
        case 6: { return "orange"; }
        case 7: { return "purple"; }
        case 8: { return "magenta"; }
        case 9: { return "cyan"; }
        default: { return "black"; }
    }
}

function genCell(cell: any, path: string[], sharedProp: SharedMiPropVersioned) {
    const isEdit: boolean = isEditable(sharedProp);
    const reactElem: any[] = [];
    reactElem.push(
        <td style={{ borderWidth: "4px", borderColor: getColor(cell), borderStyle: "solid" }}>
            {genInput(path, isEdit, sharedProp, cell)}
        </td>);
    return reactElem;
}

function isEditable(sharedProp: SharedMiPropVersioned) {
    try {
        const headVersion = sharedProp.getHeadVersion(branch)!;
        const localVersion = sharedProp.localVersion;
        if (localVersion === undefined) { return true; }
        const isEdit: boolean = headVersion.branch === localVersion?.branch
            && headVersion.offset === localVersion.offset;
        return isEdit;
    }
    catch (error) {
        return true;
    }
}

function genInput(path: string[], isEdit: boolean, sharedProp: SharedMiPropVersioned, cell: any) {
    if (isEdit) {
        return <input id={genPathInputId(path)} style={{ width: "50px", textAlign: "right" }}
            onChange={(e) => {
                const inputElem = document.getElementById(genPathInputId(path)) as HTMLInputElement;
                const inputVal = inputElem.value;
                setDirect(branch, sharedProp, path, inputVal);
            }}
            type="text" value={cell instanceof Map ? "" : cell}></input>;
    }
    else {
        return <input id={genPathInputId(path)} disabled style={{ width: "50px", textAlign: "right" }}
            onChange={(e) => {
                const inputElem = document.getElementById(genPathInputId(path)) as HTMLInputElement;
                const inputVal = inputElem.value;
                setDirect(branch, sharedProp, path, inputVal);
            }}
            type="text" value={cell instanceof Map ? "" : cell}></input>;
    }
}

function incRow(map: Map<string, any>, path: string[], sharedProp: SharedMiPropVersioned) {
    const changes: IMiChange[] = [];
    Array.from(map.keys()).forEach((key) => {
        let originalValue = parseInt(map.get(key), 10);
        originalValue++;
        changes.push(setChange([...path, key], originalValue));
    });
    sharedProp.push(branch, changes);
}

function getIncRow(row: Map<string, any>, path: string[], sharedProp: SharedMiPropVersioned) {
    const reactElem: any[] = [];
    reactElem.push(
        <td style={{ borderWidth: "4px", borderColor: "black", borderStyle: "solid", textAlign: "center" }}>
            <button disabled={!isEditable(sharedProp)} style={{ width: "50px", textAlign: "center" }}
                onClick={() => {
                    incRow(row, path, sharedProp);
                }}
            >+1</button>

        </td>,

    );
    return reactElem;
}

function incAll(map: Map<string, any>, sharedProp: SharedMiPropVersioned) {
    const changes: IMiChange[] = [];
    Array.from(map.keys()).forEach((rowkey) => {
        Array.from(map.get(rowkey).keys()).forEach((colkey) => {
            let value = parseInt(map.get(rowkey).get(colkey), 10);
            value++;
            changes.push(setChange([rowkey, colkey as string], value));
        });
    },
    );
    sharedProp.push(branch, changes);
}

function genIncAll(map: Map<string, any>, sharedProp: SharedMiPropVersioned) {
    const reactElem: any[] = [];
    reactElem.push(
        <td style={{ borderWidth: "4px", borderColor: "black", borderStyle: "solid", textAlign: "center" }}>
            <button disabled={!isEditable(sharedProp)} style={{ width: "50px", textAlign: "center" }}
                onClick={() => {
                    incAll(map, sharedProp);
                }}
            >All +1</button>

        </td>,

    );
    return reactElem;
}

function genRow(row: Map<string, any>, path: string[], sharedProp: SharedMiPropVersioned) {
    const reactElem: any[] = [];
    const cellKeys = Array.from(row.keys()).map((key) => parseInt(key, 10)).sort();
    cellKeys.forEach((cellkey) =>
        reactElem.push(
            genCell(row.get(cellkey.toString()), [...path, cellkey.toString()], sharedProp),
        ),
    );
    reactElem.push(
        getIncRow(row, path, sharedProp),
    );
    return reactElem;
}

function incColumn(map: Map<string, any>, colNr: number, sharedProp: SharedMiPropVersioned) {
    const changes: IMiChange[] = [];
    Array.from(map.keys()).forEach((key) => {
        let originalValue = parseInt(map.get(key).get(colNr.toString()), 10);
        originalValue++;
        changes.push(setChange([key, colNr.toString()], originalValue));
    });
    sharedProp.push(branch, changes);
}

function genIncCol(map: Map<string, any>, sharedProp: SharedMiPropVersioned) {
    const reactElem: any[] = [];
    const firstKey = Array.from(map.keys())[0];
    if (firstKey !== undefined) {
        const nr = Array.from(map.get(firstKey).keys()).length;
        for (let i = 0; i < nr; i++) {
            reactElem.push((
                <td style={{ borderWidth: "4px", borderColor: "black", borderStyle: "solid", textAlign: "center" }}>
                    <button disabled={!isEditable(sharedProp)} style={{ width: "100%", textAlign: "center" }}
                        onClick={() => {
                            incColumn(map, i, sharedProp);
                        }}
                    >+1</button>

                </td>
            ));
        }
    }
    return reactElem;
}

function genRows(map: Map<string, any>, sharedProp: SharedMiPropVersioned) {
    const reactElem: any[] = [];
    const rowkeys = Array.from(map.keys()).map((key) => parseInt(key, 10)).sort();
    rowkeys.forEach((rowkey) =>
        reactElem.push(
            <tr style={{ borderWidth: "2px", borderColor: "#aaaaaa", borderStyle: "solid" }}>
                {genRow(map.get(rowkey.toString()), [rowkey.toString()], sharedProp)}
            </tr>,
        ),
    );

    reactElem.push(
        <tr style={{ borderWidth: "2px", borderColor: "#aaaaaa", borderStyle: "solid" }}>
            {genIncCol(map, sharedProp)}
            {genIncAll(map, sharedProp)}
        </tr>,
    );
    return reactElem;
}

function genTable(map: Map<string, any>, sharedProp: SharedMiPropVersioned) {
    const reactElem: any[] = [];
    reactElem.push((
        <table style={{ borderWidth: "4px", borderColor: "#aaaaaa", borderStyle: "solid" }}>
            {genRows(map, sharedProp)}
        </table>
    ));
    return reactElem;
}

function genBranchOptions(sharedProp: SharedMiPropVersioned) {
    const reactElem: any[] = [];
    sharedProp.listBranches().forEach((b) => {
        reactElem.push(<option value={b}>{b}</option>);
    });
    return reactElem;
}

function genBranchSwitch(sharedProp: SharedMiPropVersioned, setCurrentBranch, setLocalMap, localMapRef) {
    const reactElem: any[] = [];
    reactElem.push((
        <select style={{ borderWidth: "2px", borderStyle: "solid" }}
            onChange={() => {
                const myBranch = (document.getElementById(BRANCH_SELECT_ID)! as HTMLSelectElement)
                    .selectedOptions.item(0)?.value;
                const map = new Map();
                const head = sharedProp.getHeadSummary(myBranch!);
                applyChanges(head.changes, map);
                sharedProp.localVersion = head.toVersion.offset < 0 ? undefined : head.toVersion;
                localMapRef.current = map;
                setLocalMap(map);
                setCurrentBranch(myBranch);
            }}
            name={BRANCH_SELECT_NAME} id={BRANCH_SELECT_ID}>
            {genBranchOptions(sharedProp)}
        </select>
    ));
    return reactElem;
}

function bwd(sharedProp: SharedMiPropVersioned, localMapRef, setLocalMap) {
    moveCursor(localMapRef, sharedProp, setLocalMap, -1);
}

function moveCursor(localMapRef: any, sharedProp: SharedMiPropVersioned, setLocalMap: any, shift: number) {
    const current = localMapRef.current;
    let map;
    if (current === undefined) {
        map = new Map();
    }
    else {
        map = new Map(localMapRef.current);
    }
    let headVersion = sharedProp.getHeadVersion(branch)!;
    if (headVersion === undefined) {
        headVersion = new MiVersion(branch, -1);
    }
    let fromVersion = sharedProp.localVersion!;
    if (fromVersion === undefined) {
        fromVersion = headVersion;
    }
    const toVersion = new MiVersion(branch, fromVersion.offset + shift);

    const changeset = sharedProp.getSummary(branch, fromVersion, toVersion)!;
    applyChanges(changeset.changes, map);
    localMapRef.current = map;
    const localBase = sharedProp.localBase;
    sharedProp.localVersion = changeset.toVersion;
    if (localBase === undefined) {
        sharedProp.localBase = sharedProp.localVersion;
    }
    else {
        if (compareVersions(headVersion, sharedProp.localVersion)) {
            sharedProp.localBase = undefined;
        }
    }
    setLocalMap(map);
}

function fwd(sharedProp: SharedMiPropVersioned, localMapRef, setLocalMap) {
    moveCursor(localMapRef, sharedProp, setLocalMap, +1);
}

function apply(sharedProp: SharedMiPropVersioned, localMapRef, setLocalMap) {
    const map = new Map();
    const head = sharedProp.getHeadSummary(branch);
    applyChanges(head.changes, map);
    localMapRef.current = map;
    const toVersion = sharedProp.localVersion!;
    sharedProp.localVersion = head.toVersion;
    setLocalMap(map);
    sharedProp.push(branch, [new MiUndoChange(toVersion)]);
}

function newBranch(branchName: string, sharedProp: SharedMiPropVersioned) {
    sharedProp.push(branch, [new MiBranchChange(sharedProp.localVersion!, branchName)]);
}

function App() {
    const [localMap, setLocalMap] = React.useState(new Map<string, any>());
    const [sharedProp, setFluidSharedObjects] = React.useState<SharedMiPropVersioned>();
    const [currentBranch, setCurrentBranch] = React.useState<string>(MASTER_BRANCH);
    const [reload, setReload] = React.useState<number>(0);
    branch = currentBranch;
    console.log(reload);
    const localMapRef = React.useRef(localMap);
    React.useEffect(() => {
        void getFluidData()
            .then((data) => setFluidSharedObjects(data));
    }, []);
    React.useEffect(() => {
        if (sharedProp !== undefined) {
            const initLocalMap = () => {
                const changeset: IMiChangeset = sharedProp.getHeadSummary(branch);
                const map = new Map<string, any>();
                applyChanges(changeset.changes, map);
                localMapRef.current = map;
                sharedProp.localVersion = changeset.toVersion;
                setLocalMap(map);
            };

            const updateLocalMap = (changeset: IMiChangeset) => {
                if (changeset.toVersion.branch === branch) {
                    if (sharedProp.localVersion === undefined || sharedProp.localVersion.offset === changeset.fromVersion.offset) {
                        const current = localMapRef.current;
                        let map;
                        if (current === undefined) {
                            map = new Map();
                        }
                        else {
                            map = new Map(localMapRef.current);
                        }
                        applyChanges(changeset.changes, map);
                        localMapRef.current = map;
                        sharedProp.localVersion = changeset.toVersion;
                        setLocalMap(map);
                    }
                }
            };
            if (isCreate) {
                for (let i: number = 0; i < 10; i++) {
                    addPathDirect(currentBranch, sharedProp, [i.toString()]);
                    for (let j: number = 0; j < 10; j++) {
                        addPathDirect(currentBranch, sharedProp, [i.toString(), j.toString()]);
                        setDirect(currentBranch, sharedProp, [i.toString(), j.toString()], "0");
                    }
                }
            }
            sharedProp.on("coreLoaded", initLocalMap);
            sharedProp.on("changesetApplied", updateLocalMap);
            sharedProp.on("branchAdded", () => setReload(Math.random()));
            sharedProp.emit("coreLoaded");
            return () => { sharedProp.off("coreLoaded", initLocalMap); sharedProp.off("changesetApplied", updateLocalMap); };
        } else {
            return;
        }
    }, [sharedProp]);

    if (sharedProp !== undefined) {
        const reactElem = genTable(localMap, sharedProp);

        return (
            <div className="App">
                <h1>DDS Playground</h1>
                <br></br>
                <br></br>
                <button style={{ width: 50 }} onClick={() => {
                    bwd(sharedProp, localMapRef, setLocalMap);
                }}>{"<"}</button>

                <button style={{ width: 50 }} onClick={() => {
                    fwd(sharedProp, localMapRef, setLocalMap);
                }}>{">"}</button>
                <button style={{ width: 50 }} onClick={() => {
                    apply(sharedProp, localMapRef, setLocalMap);
                }}>{"Apply"}</button>
                <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
                <button onClick={() => {
                    const inputElem = document.getElementById(BRANCH_INPUT_ID) as HTMLInputElement;
                    const inputVal = inputElem.value;
                    newBranch(inputVal, sharedProp);
                }}>{"New Branch"}</button>
                <input id={BRANCH_INPUT_ID}></input>
                <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>
                {genBranchSwitch(sharedProp, setCurrentBranch, setLocalMap, localMapRef)}
                <br></br>
                <br></br>
                <br></br>
                {reactElem}
            </div>
        );
    } else {
        return <div>Nothing!</div>;
    }
}

// eslint-disable-next-line import/no-default-export
export default App;
