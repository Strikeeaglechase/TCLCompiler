#define print_io 65536
#define debug_io 65537
#define sevseg_enable_io 65538

int toBcd(int value) {
 	int result = 0;
 	for(int digit = 0; digit < 6; digit++) {
 		int digitValue = value % 10;
 		result = result | (digitValue << (digit * 4));
 		value = value / 10;
 	}
 
 	return result;
}

void print(int number) {
	int bcd = toBcd(number);

	write(print_io, bcd);
	write(debug_io, number);
}

void enableSevenSeg(int mask) {
	write(sevseg_enable_io, mask);
}

#export toBcd, print, enableSevenSeg