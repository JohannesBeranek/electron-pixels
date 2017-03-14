__kernel void kgol(
	__global uchar* restrict input,
	__global uchar* restrict output,
	__global uint* restrict neighbors,
	__global uchar* restrict imageData
) {
	size_t i = get_global_id(0);
	size_t n;
	uchar sum;
	bool newAlive;

	n = i * 8;

	sum = input[neighbors[n]]
		+ input[neighbors[n+1]]
		+ input[neighbors[n+2]]
		+ input[neighbors[n+3]]
		+ input[neighbors[n+4]]
		+ input[neighbors[n+5]]
		+ input[neighbors[n+6]]
		+ input[neighbors[n+7]];

	newAlive = sum == 3 || (sum == 2 && input[i]);

	output[i] = newAlive;

	imageData[i * 4] = newAlive * 255;
}