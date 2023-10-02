import { ASTFunctionCall, ASTReference } from "../parser/ast.js";
import { JSCompiler } from "./jsCompiler.js";

interface BuiltInFunction {
	name: string;

	handleCall(call: ASTFunctionCall, compiler: JSCompiler): string;
}

export const builtInFunctions: BuiltInFunction[] = [
	{
		name: "print",
		handleCall(call: ASTFunctionCall, compiler: JSCompiler): string {
			let code = "";
			call.arguments.forEach(arg => {
				code += compiler.handleNode(arg);
				code += `console.log(pop());\n`;
			});

			return code;
		}
	},
	{
		name: "printc",
		handleCall(call: ASTFunctionCall, compiler: JSCompiler): string {
			let code = "";
			call.arguments.forEach(arg => {
				code += compiler.handleNode(arg);
				code += `print(String.fromCharCode(pop()));\n`;
			});

			return code;
		}
	},
	{
		name: "malloc",
		handleCall(call: ASTFunctionCall, compiler: JSCompiler): string {
			let code = "";
			code += compiler.handleNode(call.arguments[0]);
			code += `regC = malloc(pop())\n`;
			code += `push(regC);\n`;
			return code;
		}
	},
	{
		name: "sizeof",
		handleCall(call: ASTFunctionCall, compiler: JSCompiler): string {
			const ref = call.arguments[0] as ASTReference;
			if (ref.child == null && !compiler.context.doesVarExist(ref.key)) {
				const type = compiler.resolveType(ref);
				return `push(${type.size});\n`;
			}

			const { type } = compiler.getAddressOfVariable(ref);
			return `push(${type.size});\n`;
		}
	}
];
