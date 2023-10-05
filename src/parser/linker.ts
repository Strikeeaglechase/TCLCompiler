import fs from "fs";
import path from "path";

import { JSCompiler } from "../jsCompiler/jsCompiler.js";
import { Stream } from "../stream.js";
import { ASTProg, ASTType } from "./ast.js";
import { Parser } from "./parser.js";
import { PreCompiler } from "./precompiler.js";
import { Token, Tokenizer } from "./tokenizer.js";

interface FileEntry {
	path: string;
	name: string;
	content: string;
	exportSymbols: string[];
	isRoot: boolean;
}

interface CompileUnit {
	file: FileEntry;
	tokens: Stream<Token>;
	ast: ASTProg;
}

class Linker {
	private files: FileEntry[] = [];

	constructor(private emitDebug: boolean = false) {
		if (emitDebug && !fs.existsSync("../debug")) fs.mkdirSync("../debug");
	}

	public loadFile(file: string) {
		this.readFile(file, true);
	}

	public compile(outputPath: string) {
		const compileUnits: CompileUnit[] = this.files.map(f => {
			const precompiler = new PreCompiler(f.content);
			const stream = precompiler.preTokenize();
			const tokenizer = new Tokenizer(stream);
			const tokenizerTokens = tokenizer.parse();
			this.debugTokensPrePC(f, tokenizerTokens);
			const tokens = precompiler.postTokenize(tokenizerTokens);
			this.debugTokensPostPC(f, tokens);
			const parser = new Parser(tokens, f);
			const ast = parser.parse();
			this.debugAST(f, ast);

			return { file: f, tokens, ast };
		});

		const finalAst: ASTProg = {
			type: ASTType.Prog,
			body: []
		};

		compileUnits.forEach(unit => {
			finalAst.body.push(...unit.ast.body);
		});

		const compiler = new JSCompiler();
		const js = compiler.compile(finalAst);
		fs.writeFileSync(outputPath, js);
	}

	private debugTokensPrePC(file: FileEntry, tokens: Stream<Token>) {
		if (!this.emitDebug) return;
		const strTokens = tokens
			._all()
			.map(t => `${t.type} ${t.value}`)
			.join("\n");

		fs.writeFileSync(this.debugPath(file, "tokens-prepc.txt"), strTokens);
	}

	private debugTokensPostPC(file: FileEntry, tokens: Stream<Token>) {
		if (!this.emitDebug) return;
		const strTokens = tokens
			._all()
			.map(t => `${t.type} ${t.value}`)
			.join("\n");

		fs.writeFileSync(this.debugPath(file, "tokens.txt"), strTokens);
	}

	private debugAST(file: FileEntry, ast: ASTProg) {
		if (!this.emitDebug) return;
		const strAst = JSON.stringify(ast, null, 3);
		fs.writeFileSync(this.debugPath(file, "ast.json"), strAst);

		// const visitor = new Visitor([ast]);
		// visitor.visit(
		// 	node => {
		// 		console.log(node.type);
		// 	},
		// 	[ASTType.FunctionDeclaration]
		// );
	}

	private debugPath(file: FileEntry, name: string) {
		return `../debug/${file.name}-${name}`;
	}

	private readFile(file: string, isRoot = false) {
		// Already loaded?
		if (this.files.find(f => f.path == file)) {
			// Move to front
			const index = this.files.findIndex(f => f.path == file);
			const entry = this.files.splice(index, 1)[0];
			this.files.unshift(entry);
			return;
		}

		const content = fs.readFileSync(file, "utf-8");
		const lines = content.split("\n");
		const exportSymbols: string[] = [];
		lines
			.filter(l => l.startsWith("#export"))
			.forEach(es => {
				const symbols = es.match(/#export (.+)/)[1];
				exportSymbols.push(...symbols.split(","));
			});

		const name = path.basename(file).split(".")[0];
		this.files.unshift({ path: file, content, exportSymbols, isRoot, name });

		lines
			.filter(l => l.startsWith("#import"))
			.forEach(ip => {
				const importPath = ip.match(/#import (.+)/)[1];
				const filePath = path.join(path.dirname(file), importPath);
				this.readFile(filePath);
			});
	}
}

export { Linker, FileEntry, CompileUnit };
