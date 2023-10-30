import fs from "fs";

import { TCEmulator } from "./assembler/emulator.js";
import { ISACompiler } from "./isaCompiler/isaCompiler.js";
import { Linker } from "./parser/linker.js";
import { UnitTester } from "./unitTests.js";

let filePath: string;
if (fs.existsSync("./source/code.txt")) filePath = "./source/code.txt";
else filePath = "../source/code.txt";

const linker = new Linker();
linker.loadFile(filePath);
linker.compile("../out.tca", new ISACompiler());

// Execute
const emulator = new TCEmulator("../out.tca");
emulator.run();

const ut = new UnitTester();
// ut.runTests();
