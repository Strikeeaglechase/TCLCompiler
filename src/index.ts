import fs from "fs";

import { Parser } from "./parser/parser.js";
import { Tokenizer } from "./parser/tokenizer.js";
import { Stream } from "./stream.js";
import { JSCompiler } from "./jsCompiler.js";

let file: string;
if (fs.existsSync("./code.txt")) file = fs.readFileSync("./code.txt", "utf-8");
else file = fs.readFileSync("../code.txt", "utf-8");

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

const compiler = new JSCompiler();
const js = compiler.compile(ast);

fs.writeFileSync("../out.js", js);
