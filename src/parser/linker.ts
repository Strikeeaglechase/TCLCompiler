import fs from "fs";

// import path from "path";
import { ASTAnalyzer } from "../astAnalyzer.js";
import { Stream } from "../stream.js";
import { ASTProg, ASTType } from "./ast.js";
import { Parser, ParserError } from "./parser.js";
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

interface FileParserError extends ParserError {
	file: FileEntry;
}

interface Compiler {
	compile(ast: ASTProg): string;
}

interface VirtualFileSystem {
	readFile(file: string): string;
	writeFile(file: string, content: string): void;
}

class DirectFileSystem implements VirtualFileSystem {
	readFile(file: string): string {
		return fs.readFileSync(file, "utf-8");
	}

	writeFile(file: string, content: string): void {
		return fs.writeFileSync(file, content);
	}
}

class Linker {
	private files: FileEntry[] = [];

	private fileTransformers: ((file: FileEntry) => void)[] = [];
	private tokenTransformers: ((tokens: Stream<Token>) => Stream<Token>)[] = [];
	private astTransformers: ((ast: ASTProg) => ASTProg)[] = [];
	private assemblyTransformers: ((assembly: string) => string)[] = [];

	private doDebug = false;
	private debugPath = "";

	public compileUnits: CompileUnit[] = [];
	public parserErrors: FileParserError[] = [];
	public analyzer: ASTAnalyzer;

	constructor(private vfs: VirtualFileSystem = new DirectFileSystem()) {}

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

	public enableDebugIn(debugPath: string) {
		this.doDebug = true;
		this.debugPath = debugPath;

		if (fs.existsSync(debugPath)) fs.rmSync(debugPath, { recursive: true, force: true });
		if (!fs.existsSync(debugPath)) fs.mkdirSync(debugPath);
	}

	public loadFile(file: string) {
		this.readFile(file, true);
	}

	public produceAST() {
		this.compileUnits = this.files.map(f => {
			const debugPath = this.debugPath + "/" + f.name;
			// File
			this.fileTransformers.forEach(t => t(f));

			// Tokens
			const precompiler = new PreCompiler(f.content);
			const stream = precompiler.preTokenize();
			const tokenizer = new Tokenizer(stream);
			const tokenizerTokens = tokenizer.parse();
			let tokens = precompiler.postTokenize(tokenizerTokens);
			for (const transformer of this.tokenTransformers) tokens = transformer(tokens);
			if (this.doDebug)
				fs.writeFileSync(
					debugPath + ".tokens.txt",
					tokens
						._all()
						.map(t => `${t.type} ${t.value}   ${t.line}:${t.column}`)
						.join(`\n`)
				);

			// AST
			const parser = new Parser(tokens, f);
			let ast = parser.parse();
			for (const transformer of this.astTransformers) ast = transformer(ast);
			if (this.doDebug) fs.writeFileSync(debugPath + ".ast.json", JSON.stringify(ast, null, 3));

			parser.errors.forEach(err => {
				this.parserErrors.push({ ...err, file: f });
			});

			return { file: f, tokens, ast };
		});

		const finalAst: ASTProg = {
			type: ASTType.Prog,
			body: [],
			line: 0,
			column: 0
		};

		this.compileUnits.forEach(unit => {
			finalAst.body.push(...unit.ast.body);
		});

		if (this.doDebug) fs.writeFileSync(this.debugPath + "/finalAst.json", JSON.stringify(finalAst, null, 3));
		// console.log(JSON.stringify(finalAst, null, 2));
		this.analyzer = new ASTAnalyzer();
		this.analyzer.load(finalAst);

		return finalAst;
	}

	public compile(outputPath: string, compiler: Compiler): boolean {
		try {
			const finalAst = this.produceAST();
			let assembly = compiler.compile(finalAst);
			for (const transformer of this.assemblyTransformers) assembly = transformer(assembly);
			if (this.doDebug) fs.writeFileSync(this.debugPath + ".assembly.txt", assembly);
			this.vfs.writeFile(outputPath, assembly);
			return true;
		} catch (e) {
			console.error(`Unable to compile because ${e.message}`);
			// console.error(e);
			return false;
		}
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

		const content = this.vfs.readFile(file);
		const lines = content.split("\n");
		const exportSymbols: string[] = [];
		lines
			.filter(l => l.startsWith("#export"))
			.forEach(es => {
				const symbols = es.match(/#export (.+)/)[1];
				exportSymbols.push(...symbols.split(",").map(s => s.trim()));
			});

		const sep = file.includes("/") ? "/" : "\\";
		const basename = file.split(sep).pop();
		const dirPath = file.split(sep).slice(0, -1).join(sep);
		const name = basename.split(".")[0];
		this.files.unshift({ path: file, content, exportSymbols, isRoot, name });

		lines
			.filter(l => l.startsWith("#import"))
			.forEach(ip => {
				const importPath = ip.match(/#import (.+)/)[1];
				const filePath = dirPath + "/" + importPath;
				this.readFile(filePath);
			});
	}
}

export { Linker, FileEntry, CompileUnit, Compiler, VirtualFileSystem };
