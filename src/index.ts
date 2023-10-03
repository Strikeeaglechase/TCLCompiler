import fs from "fs";

import { JSCompiler } from "./jsCompiler/jsCompiler.js";
import { Parser } from "./parser/parser.js";
import { PreCompiler } from "./parser/precompiler.js";
import { Tokenizer } from "./parser/tokenizer.js";
import { UnitTester } from "./unitTests.js";

let file: string;
if (fs.existsSync("./code.txt")) file = fs.readFileSync("./code.txt", "utf-8");
else file = fs.readFileSync("../code.txt", "utf-8");

const precompiler = new PreCompiler(file);
const stream = precompiler.preTokenize();
const tokenizer = new Tokenizer(stream);
const tokenizerTokens = tokenizer.parse();
const tokens = precompiler.postTokenize(tokenizerTokens);

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

const compiler = new JSCompiler();
const js = compiler.compile(ast);

fs.writeFileSync("../out.js", js);

const ut = new UnitTester();
ut.runTests();
