import { ASTFunctionCall } from "../parser/ast.js";
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
	}
];
