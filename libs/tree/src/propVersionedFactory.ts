/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { SharedMiPropVersioned } from "./propVersioned";
import { ISharedMiPropVersioned } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the map
 */
export class MiPropFactoryVersioned implements IChannelFactory {
    public static readonly Type = "https://graph.microsoft.com/types/mipropversioned";

    public static readonly Attributes: IChannelAttributes = {
        type: MiPropFactoryVersioned.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return MiPropFactoryVersioned.Type;
    }

    public get attributes() {
        return MiPropFactoryVersioned.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedMiPropVersioned> {
        const miprop = new SharedMiPropVersioned(id, runtime, attributes);
        await miprop.load(services);
        return miprop;
    }

    public create(document: IFluidDataStoreRuntime, id: string): ISharedMiPropVersioned {
        const miprop = new SharedMiPropVersioned(id, document, this.attributes);
        miprop.initializeLocal();
        return miprop;
    }
}
