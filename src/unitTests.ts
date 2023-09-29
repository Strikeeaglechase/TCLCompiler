import { execSync } from "child_process";
import fs from "fs";

import { JSCompiler } from "./jsCompiler/jsCompiler.js";
import { Parser } from "./parser/parser.js";
import { Tokenizer } from "./parser/tokenizer.js";
import { Stream } from "./stream.js";

class UnitTester {
	private testFiles: string[] = [];
	constructor() {
		if (!fs.existsSync("../unitTests")) fs.mkdirSync("../unitTests");
		if (!fs.existsSync("../unitTests/outs")) fs.mkdirSync("../unitTests/outs");

		fs.readdirSync("../unitTests")
			.filter(f => f.endsWith(".txt"))
			.forEach(f => this.testFiles.push(f));
	}

	public runTests() {
		this.testFiles.forEach(f => this.runTest(f));
	}

	private runTest(testFile: string) {
		const file = fs.readFileSync(`../unitTests/${testFile}`, "utf-8");
		const expected = file.match(/\/\/ EXPECT: (\d+)/)[1];

		const stream = new Stream(file.trim().split(""));
		const tokenizer = new Tokenizer(stream);
		const tokens = tokenizer.parse();
		const parser = new Parser(tokens);
		const ast = parser.parse();
		const compiler = new JSCompiler();
		const js = compiler.compile(ast);

		fs.writeFileSync(`../unitTests/outs/${testFile}.js`, js);
		const result = execSync(`node ../unitTests/outs/${testFile}.js`).toString().trim();
		if (result != expected) {
			console.error(`Test ${testFile} failed! Expected ${expected}, got ${result}`);
		}
	}
}

export { UnitTester };
