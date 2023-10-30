import fs from "fs";
import path from "path";

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

interface Compiler {
	compile(ast: ASTProg): string;
}

class Linker {
	private files: FileEntry[] = [];

	private fileTransformers: ((file: FileEntry) => void)[] = [];
	private tokenTransformers: ((tokens: Stream<Token>) => Stream<Token>)[] = [];
	private astTransformers: ((ast: ASTProg) => ASTProg)[] = [];
	private assemblyTransformers: ((assembly: string) => string)[] = [];

	public addFileTransformer(transformer: (file: FileEntry) => void) {
		this.fileTransformers.push(transformer);
	}

	public addTokenTransformer(transformer: (tokens: Stream<Token>) => Stream<Token>) {
		this.tokenTransformers.push(transformer);
	}

	public addASTTransformer(transformer: (ast: ASTProg) => ASTProg) {
		this.astTransformers.push(transformer);
	}

	public addAssemblyTransformer(transformer: (assembly: string) => string) {
		this.assemblyTransformers.push(transformer);
	}

	public loadFile(file: string) {
		this.readFile(file, true);
	}

	public compile(outputPath: string, compiler: Compiler) {
		const compileUnits: CompileUnit[] = this.files.map(f => {
			// File
			this.fileTransformers.forEach(t => t(f));

			// Tokens
			const precompiler = new PreCompiler(f.content);
			const stream = precompiler.preTokenize();
			const tokenizer = new Tokenizer(stream);
			const tokenizerTokens = tokenizer.parse();
			let tokens = precompiler.postTokenize(tokenizerTokens);
			for (const transformer of this.tokenTransformers) tokens = transformer(tokens);

			// AST
			const parser = new Parser(tokens, f);
			let ast = parser.parse();
			for (const transformer of this.astTransformers) ast = transformer(ast);

			return { file: f, tokens, ast };
		});

		const finalAst: ASTProg = {
			type: ASTType.Prog,
			body: []
		};

		compileUnits.forEach(unit => {
			finalAst.body.push(...unit.ast.body);
		});

		let assembly = compiler.compile(finalAst);
		for (const transformer of this.assemblyTransformers) assembly = transformer(assembly);
		fs.writeFileSync(outputPath, assembly);
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
				exportSymbols.push(...symbols.split(",").map(s => s.trim()));
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

export { Linker, FileEntry, CompileUnit, Compiler };
