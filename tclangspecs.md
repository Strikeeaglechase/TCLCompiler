# TC Lang (TCL) specifications

Statement separator: `;`  
Comments: //

Everything runs on the top level method for our needs. Internally do whatever you want.

-  You MUST push and pop the stack when your application is run.

## Variable declaration

Declaring a variable consists of:

`[const] [Type] [Var Name] = [Literal / Other Var Name]`

`const`: Defines a variable as immutable  
`Type`: Type of the variable  
`var name`: The name of the variable, may not start with a digit and may only contain alphanumeric characters and underscores.  
`Literal / Other var name`: Value of variable

```
const int two = 2;
```

## Array declaration

`<const> <type>[<array length>] = { <comma-separated elements> }`

```
const int[3] myarr = {13, 14, 15};
```

## Array indexing

```
const int[3] myarr = {13, 14, 15};

myarr[2]; // is equal to 15
```

## Memory management

Pointer referencing:

Let `x = 5` at mem address `0d240`

```
int ptr = *x; // ptr = 240
```

Value referencing:

```
int val = &ptr; // val = 5
int val = &240; // val = 5
```

## Types

`int`: integer with a length to be specified later  
`char`: 8 bit wide integer useful for whatever requires knowing it is a character  
`bool`: 1 bit wide integer useful for not confusing it with other stuff  
`struct`: defines a class structure that may hold variables and methods. It is always static, as OOP and GC is hard.

Possibly for later implementations:  
`float`: floating point number with a length to be specified later

## Special non-primitive types that are part of the language:

`string`: Array of chars

**Note: structs have to be defined individually, not inline**
`struct`:

```
struct Struct1 = {
    int val3;
}

struct Type {
    int val1;
    int val2;

    int method1() {

    }

    Struct1 iveranoutofnames;
}
```

`enum`:

```
enum HTTPMethods {
    GET: 0;
    POST: 1;
    TRACE: 2;
}

enum HTTPMethods {
    GET;
    POST;
    TRACE;
}
```

## Control flow

`if` statements

```
if (boolean == true)
{

}
elseif (boolean == true)
{

}
else
{

}
```

`while` loops

```
while (boolean = true)
{

}
```

`break`: Inside of a while loop, exits the loop  
`continue`: Inside of a while loop, jumps to beginning of loop

## Methods

Does not support:

-  Varargs
-  Encapsulation

```
int method(int arg1, int arg2) {
    return arg1 + arg2;
}
```

```
int val = method(2, 4);
```

## Casting

Casting may always be done to a higher order type, and may be specified as allowed to a lower order type.

Order of types:

1. bool
2. int
3. char
4. float

Allowing casts:

```
int num = 1;
bool b1 = (bool) num; // If non-zero is true like in C++
```

## Operands

-  Addition: +
-  Subtraction: -
-  Multiplication: \*
-  Division: /
-  Modulo: %
-  Bitwise OR: |
-  Bitwise AND: &
-  Bitwise XOR: ^
-  Boolean OR: ||
-  Boolean AND: &&
-  Boolean NOT: !
-  Equals: ==
-  Less than: <
-  Greater than: >
-  Less than or zero: <=
-  Greater than or zero: >=
-  Not equal: !=

# Reserved methods:

-  `typeof(var)` - Returns type of variable as String (possibly int?)
-  `sizeof(struct)` - Returns size of struct in bytes
-  `lengthof(array)` - Returns length of array
-  `lengthof(string)` - Returns length of string
-  `nextbyte()` - Reads the next byte from TC input stream
-  `outputbyte()`- Outputs the next byte to TC output stream

Think about:  
TC supports multiple IO types, they are:

-  Keyboard
-  Network (may be just `outputByte()` as sandbox doesn't actually have an ouput and we need to check what our program does).
-  Specific file
-  UNIX time (64 bit)
-  Sprite display
-  Console
-  7-seg displays
-  Pixel display

## Literal declaration

`____` denotes any numerical value (including A-F for hex)  
`----` denotes any alphanumeric value

`0d____`: decimal number (redundant, used for clarity)  
`0b____`: binary number  
`0o____`: octal number  
`0x____`: hexadecimal number  
`____`: decimal number  
`"----"`: String  
`'-'`: char

## Stack

For manual bullshitery.

A stack object may exist at any point in time. It has the following attributes:

`Stack.pop()` - Returns int  
`Stack.push(byte val)` - Returns void

## Usage of `goto`

Because our code may suck, we may want to use `goto`

A line beginning with a colon (`:`) defines a label

`goto` may then be used to jump to that part of the code. Try not to obliterate the stack.

```
if (yourMom) {
    :yourMom

    // shit code

    goto yourMom
}
```

## Full list of keywords

```
bool
break
char
const
continue
else
elseif
enum
false
float
goto
if
int
lengthof
nextbyte
outputbyte
return
sizeof
static
string
struct
true
typeof
void
while
```

### Just "keywords" (Chase is cringe)

```
break
const
continue
else
elseif
goto
if
return
static
while
```

### Just types

```
bool
char
enum
float
int
string
struct
void
```

### Just methods

```
lengthof
nextbyte
outputbyte
sizeof
typeof
```

## true/false

```
true
false
```
