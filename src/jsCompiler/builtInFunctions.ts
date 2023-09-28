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
	}
];
