import fs from "fs";

import { Linker } from "./parser/linker.js";
import { UnitTester } from "./unitTests.js";

let filePath: string;
if (fs.existsSync("./source/code.txt")) filePath = "./source/code.txt";
else filePath = "../source/code.txt";

const linker = new Linker(true);
linker.loadFile(filePath);
linker.compile("../out.js");

const ut = new UnitTester();
ut.runTests();
