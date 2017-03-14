__kernel void kmove(
	__global uint *pixels,
	__global bool *nocalc,
	__global float *resH,
	__global float *resV,
	__global float *speedH,
	__global float *speedV,
	__global float *weights,
	__local uint width,
	__local uint height,
	__local uint total,
	__local double gravity
) {
	size_t i = get_global_id(0);
	// bounds checking
	if (i >= total) return;
	// is there actually any pixel at this position?
	if (pixels[i] == 0) return;
	// nocalc flag set?
	if (nocalc[i]) return;
	// does this pixel actually have speed?
	// no need for collision detection here if not
	if (speedH[i] <= .0f && speedV[i] <= .0f) {
		pixelsNew[i] = pixels[i];
	} else {
		size_t ni = i;
		uint x = i % width;

		resH[i] += speedH[i];
		
		if (resH[i] >= 1.0f) { // move to the right
			x ++;
			resH[i] -= 1.0f;
			// a) pixel on right border, will go out of screen
			if (x >= width) {
				pixels[i] = 0;
				return;
			}

			// new i is to the right, so +1
			ni++;
		} else if (resH[i] <= -1.0f) { // move to the left
			if (x == 0) {
				pixels[i] = 0;
				return;
			}

			x--;
			resH[i] += 1.0f;

			// new i is to the left, so -1
			ni--;
		}

		uint y = i / width;

		resV[i] += speedV[i];

		if (resV[i] >= 1.0f) { // move up
			y++;
			resV[i] -= 1.0f;
			if (y >= height) { // out of screen to the top
				pixels[i] = 0;
				return;
			}

			ni += width;
		} else if (resV[i] <= -1.0f) { // move down
			// only really move if pixel is not on bottom of the screen
			if (y > 0) { 
				y--;
				ni -= width;
			}

			resV[i] += 1.0;
		}

		// b) interact with pixel on the right
		if (pixels[ni] == 0) { // simple swap with empty pixel
			pixels[ni] = pixels[i];
			nocalc[ni] = true;
			resH[ni] = resH[i];
			resV[ni] = resV[i];
			speedH[ni] = speedH[i];
			speedV[ni] = speedV[i];
			// remove original pixel
			pixels[i] = 0;
		} else {
			// now it all depends on the materials ...
			uint atype = pixels[i];
			uint btype = pixels[ni];

			// check weights
			uint aweight = weights[atype];
			uint bweight = weights[btype];

			if (aweight > bweight) {
				// swap - TODO: this will definitely get us into parallel trouble ....
				uint tmp = pixels[ni];
				pixels[ni] = pixels[i];
				pixels[i] = tmp;

				nocalc[ni] = true;
			} // else: leave them as is
		}
	}
}