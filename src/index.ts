import fs from "fs";

import { JSCompiler } from "./jsCompiler/jsCompiler.js";
import { Parser } from "./parser/parser.js";
import { Tokenizer } from "./parser/tokenizer.js";
import { Stream } from "./stream.js";
import { UnitTester } from "./unitTests.js";

let file: string;
if (fs.existsSync("./code.txt")) file = fs.readFileSync("./code.txt", "utf-8");
else file = fs.readFileSync("../code.txt", "utf-8");

// Extract lines from file
const semiTerminatedLines = file
	.split("\n")
	.filter(l => !l.startsWith("//") && l.trim() != "" && l.trim().endsWith(";"))
	.map(l => l.trim());

const stream = new Stream(file.trim().split(""));
const tokenizer = new Tokenizer(stream);
const tokens = tokenizer.parse();
fs.writeFileSync(
	"../tokens.txt",
	tokens
		._all()
		.map(t => `${t.type} ${t.value}`)
		.join("\n")
);

const parser = new Parser(tokens);
const ast = parser.parse();
fs.writeFileSync("../ast.json", JSON.stringify(ast, null, 3));

const compiler = new JSCompiler(semiTerminatedLines);
const js = compiler.compile(ast);

fs.writeFileSync("../out.js", js);

const ut = new UnitTester();
ut.runTests();
