import chalk from "chalk";
import fs from "fs";

import { ISACompiler } from "./isaCompiler/isaCompiler.js";
import { Linker } from "./parser/linker.js";

class UnitTester {
	private testFiles: string[] = [];
	private totalPassed = 0;
	private totalTests = 0;
	private totalLines = 0;

	constructor() {
		if (!fs.existsSync("../unitTests")) fs.mkdirSync("../unitTests");
		if (!fs.existsSync("../unitTests/outs")) fs.mkdirSync("../unitTests/outs");

		fs.readdirSync("../unitTests")
			.filter(f => f.endsWith(".txt"))
			.forEach(f => this.testFiles.push(f));
	}

	public runTests() {
		const start = Date.now();
		this.testFiles.forEach(f => {
			try {
				this.runTest(f);
			} catch (e) {
				console.log(`Test ${f} failed with error ${e}`);
			}
		});
		const end = Date.now();
		let rStr = `${this.totalPassed}/${this.totalTests}`;
		if (this.totalPassed == this.totalTests) rStr = chalk.green(rStr);
		else rStr = chalk.red(rStr);

		console.log(rStr + chalk.blue(` tests passed in ${end - start}ms. ${this.totalLines} total instructions`));
	}

	private runTest(testFile: string) {
		const sourcePath = `../unitTests/${testFile}`;
		const outputPath = `../unitTests/outs/${testFile}.js`;

		const file = fs.readFileSync(sourcePath, "utf-8");
		const expectedMatch = file.matchAll(/\/\/ EXPECT: (.+)/g);
		const expected = [...expectedMatch].map(m => m[1]);
		if (expected.length == 0) return;

		const linker = new Linker();
		linker.addFileTransformer(f => {
			let lines = f.content.split("\n");
			lines = lines.map(l => {
				if (!l.includes("print(")) return l;
				const idx = l.indexOf("print(");
				const endIdx = l.lastIndexOf(")");
				const printArgs = l
					.substring(idx + 6, endIdx)
					.split(",")
					.map(a => a.trim());

				let result = "";

				printArgs.forEach(arg => {
					result += `write(65537, ${arg});`;
				});

				return result;
			});
		});

		linker.loadFile(sourcePath);
		linker.compile(outputPath, new ISACompiler());

		// const result = execSync(`node ${outputPath}`).toString().trim().split("\n");
		const lines = fs.readFileSync(outputPath, "utf-8").split("\n");
		this.totalLines += lines.length;

		let allPass = true;
		expected.forEach((e, i) => {
			this.totalTests++;
			if (e != result[i]) {
				console.log(chalk.red(`Test ${testFile} failed on case ${i}, expected ${e} but got ${result[i]}`));
				allPass = false;
			} else {
				this.totalPassed++;
			}
		});

		if (allPass) console.log(chalk.blueBright(`Test ${testFile} passed`));
	}
}

export { UnitTester };
