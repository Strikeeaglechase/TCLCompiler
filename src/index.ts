import chalk from "chalk";
import fs from "fs";

import { TCEmulator } from "./assembler/emulator.js";
import { ISACompiler } from "./isaCompiler/isaCompiler.js";
import { Linker } from "./parser/linker.js";
import { printTransformer } from "./printTransformer.js";
import { UnitTester } from "./unitTests.js";

let filePath: string;
if (fs.existsSync("./source/code.txt")) filePath = "./source/code.txt";
else filePath = "../source/code.txt";

const linker = new Linker();
linker.addFileTransformer(printTransformer);
linker.enableDebugIn("../ldebug");
linker.loadFile(filePath);
const success = linker.compile("../out.tca", new ISACompiler());

const c0 = (v: number) => (v == 0 ? chalk.green(v) : chalk.red(v));
const cT = (v: boolean) => (v ? chalk.green(v) : chalk.red(v));

console.log(`\nParse errors: ${c0(linker.parserErrors.length)}, Analyzer errors: ${c0(linker.analyzer.errors.length)}, Compiled: ${cT(success)}`);
if (!success) process.exit(1);

// Execute
const emulator = new TCEmulator("../out.tca");
emulator.run();

const ut = new UnitTester();
ut.runTests();
