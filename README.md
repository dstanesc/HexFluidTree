# Experimental Tree Distributed Data Structure (PoC)

## Motivation

## Documentation

A draft [design document](./docs/design-notes.md) is available in the docs folder.

## Prerequisites / Validate with

```sh
node --version
v16.13.1

npm --version
8.1.2
```

## Clean

```sh
cd HexFluidTree
npm run clean
```

## Build

```sh
cd HexFluidTree
npm install --legacy-peer-deps
npm run build
```

## Run

Terminal 1, run in any folder

```sh
npx tinylicious
```

Terminal 2

```sh
cd HexFluidTree
npm run hello-tree
```

Open a browser to [http://localhost:8080](http://localhost:8080) copy the full URL you're redirected to. Open a second window using the copied URL to collaborate.


## Disclaimer

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact
[opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these
trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks). Use of
Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft
sponsorship.
