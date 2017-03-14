const fs = require('fs');
const electron = require('electron');
const cl = require('node-opencl');


const RUN_GAMELOOP_SYNC = true;
const GAMETICK_CL = true;
const INIT_OPENGL = false;

let canvas;  // canvas dom element
let gl;      // opengl context
let clCtx;   // opencl context
let glProgram; // opengl shader program
let clProgram; // opencl program

let clBuildDevice;
let clQueue;
// let clKernelMove;
let clKernelGol;
let clBufferAlive;
let clBufferImageData;

let
	inputIndex = 0,
	outputIndex = 1;

let locPosition;  // location of position variable in frag shader
let locTexCoord;  // location of texture coords variable in frag shader
let locSampler;   // location of sampler in frag shader

let vertexCoordBuffer;   // buffer for vertext coordinates

let texCoordBuffer;      // buffer for texture coordinate
let texture;             // texture

let imageData;           // uint8array for texture data

let textureWidth = 1600;
let textureHeight = 900;

let gridWidth = 1600;
let gridHeight = 900;

const bytesPerPixel = 4; // bytes per pixel in imageData: R,G,B,A

const pixelTotal = textureWidth * textureHeight;
const bytesTotal = pixelTotal * bytesPerPixel;

const cellsTotal = gridWidth * gridHeight;
let cellNeighbors;
const cellAlive = [];

const frameTimes = [];
let frameTimesIndex = 0;
let lastRenderTime;
let fps = 0;
let fpsDisplay;

const FRAMETIMES_TO_KEEP = 10;

function init() {
	(async () => {
		initDom();
		initDrawData();

		if (INIT_OPENGL) {
			initOpenGL();
		}

		initData();
		await initOpenCL();

		initGame();

		initEvents();

		startGameLoop();

		render();
	})();
}

function initDom() {
	canvas = document.getElementById('glscreen');

	fpsDisplay = document.getElementById('fps');
}

function initDrawData() {
	imageData = new Uint8Array(bytesTotal);
}

function initOpenGL() {
	gl = canvas.getContext('experimental-webgl');
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

	// init vertex buffer
	vertexCoordBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexCoordBuffer);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([
			-1.0, -1.0,
			1.0, -1.0,
			-1.0,  1.0,
			-1.0,  1.0,
			1.0, -1.0,
			1.0,  1.0]),
		gl.STATIC_DRAW
	);

	// ------ SHADER SETUP
	const vertexShader = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertexShader, fs.readFileSync(__dirname + '/shader-vertex.glsl', 'utf-8'));
	gl.compileShader(vertexShader);
	console.log('vertexShaderLog', gl.getShaderInfoLog(vertexShader));

	const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragmentShader, fs.readFileSync(__dirname + '/shader-fragment.glsl', 'utf-8'));
	gl.compileShader(fragmentShader);
	console.log('fragmentShaderLog', gl.getShaderInfoLog(fragmentShader));


	glProgram = gl.createProgram();
	gl.attachShader(glProgram, vertexShader);
	gl.attachShader(glProgram, fragmentShader);
	gl.linkProgram(glProgram);
	console.log('glProgramLog', gl.getProgramInfoLog(glProgram));

	gl.useProgram(glProgram);

	// ---
	locPosition = gl.getAttribLocation(glProgram, 'a_position');
	gl.enableVertexAttribArray(locPosition);

	// provide texture coordinates for the rectangle.
  	locTexCoord = gl.getAttribLocation(glProgram, 'a_texCoord');
	gl.enableVertexAttribArray(locTexCoord);


	// ------ TEXTURE SETUP
	texCoordBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		0.0,  0.0,
		1.0,  0.0,
		0.0,  1.0,
		0.0,  1.0,
		1.0,  0.0,
		1.0,  1.0]), gl.STATIC_DRAW);


	// init texture to be all solid
	for (let i = 0; i < pixelTotal; i++) {
		const offset = i * bytesPerPixel;
		imageData[offset + 3] = 255;
	}

	texture = gl.createTexture();

	locSampler = gl.getUniformLocation(glProgram, 'u_sampler');
}

function initData() {
	cellNeighbors = new Uint32Array(cellsTotal * 8);
	cellAlive[0] = new Uint8Array(cellsTotal);
	cellAlive[1] = new Uint8Array(cellsTotal);

	// GOL: Cells
	let index = 0, indexNeighbors = 0;
	const maxX = gridWidth - 1;
	const maxY = gridHeight - 1;

	for (let y = 0; y < gridHeight; y++) {
		const
			prevRow = (y - 1) * gridWidth,
			thisRow = prevRow + gridWidth,
			nextRow = thisRow + gridWidth;

		for (let x = 0; x < gridWidth; x++) {


			cellNeighbors[indexNeighbors++] = (prevRow + x - 1 + cellsTotal) % cellsTotal;
			cellNeighbors[indexNeighbors++] = (prevRow + x + cellsTotal) % cellsTotal;
			cellNeighbors[indexNeighbors++] = (prevRow + x + 1 + cellsTotal) % cellsTotal;

			cellNeighbors[indexNeighbors++] = (thisRow + x - 1 + cellsTotal) % cellsTotal;
			cellNeighbors[indexNeighbors++] = (thisRow + x + 1) % cellsTotal;

			cellNeighbors[indexNeighbors++] = (nextRow + x - 1) % cellsTotal;
			cellNeighbors[indexNeighbors++] = (nextRow + x) % cellsTotal;
			cellNeighbors[indexNeighbors++] = (nextRow + x + 1) % cellsTotal;

			cellAlive[0][index++] = (Math.random() > 0.85) + 0;
		}
	}
}

async function initOpenCL() {
	// --- Init opencl
	// Best case we'd init a shared opengl/opencl context here, but node-opencl doesn't currently support that
	const platforms = cl.getPlatformIDs();
	for(let i = 0; i < platforms.length; i++)
		console.info(`Platform ${i}: ${cl.getPlatformInfo(platforms[i], cl.PLATFORM_NAME)}`);

	const platform = platforms[0];

	const devices = cl.getDeviceIDs(platform, cl.DEVICE_TYPE_ALL);
	for(let i = 0; i < devices.length; i++)
		console.info(`  Devices ${i}: ${cl.getDeviceInfo(devices[i], cl.DEVICE_NAME)}`);

	console.info('creating context');

	clCtx = cl.createContext([cl.CONTEXT_PLATFORM, platform], devices);

	// prepare opencl program
	// const clProgramSource = fs.readFileSync(__dirname + '/program.opencl', 'utf-8');

	// GOL
	const clProgramSource = fs.readFileSync(__dirname + '/gol.opencl', 'utf-8');
	clProgram = cl.createProgramWithSource(clCtx, clProgramSource);
	cl.buildProgram(clProgram);

	// create kernels
	// build kernel for first device
	clBuildDevice = cl.getContextInfo(clCtx, cl.CONTEXT_DEVICES)[0];
	console.info('Using device: ' + cl.getDeviceInfo(clBuildDevice, cl.DEVICE_NAME));

 	try {
 //  	clKernelMove = cl.createKernel(clProgram, 'kmove');
 		clKernelGol = cl.createKernel(clProgram, 'kgol');
	} catch(err) {
		console.error(cl.getProgramBuildInfo(clProgram, clBuildDevice, cl.PROGRAM_BUILD_LOG));
		process.exit(-1);
	}

	// create buffers
	const clBufferNeighbors = cl.createBuffer(clCtx, cl.MEM_READ_ONLY, cellNeighbors.byteLength);

	clBufferAlive = [
		cl.createBuffer(clCtx, cl.MEM_READ_WRITE, cellAlive[inputIndex].byteLength),
		cl.createBuffer(clCtx, cl.MEM_READ_WRITE, cellAlive[outputIndex].byteLength)
	];

	clBufferImageData = cl.createBuffer(clCtx, cl.MEM_WRITE_ONLY, imageData.byteLength);

	// will be set when needed so we can swap em
	// cl.setKernelArg(clKernelGol, 0, 'uchar*', clBufferAlive[0]);
	// cl.setKernelArg(clKernelGol, 1, 'uchar*', clBufferAlive[1]);
	cl.setKernelArg(clKernelGol, 2, 'uint*', clBufferNeighbors);
	cl.setKernelArg(clKernelGol, 3, 'uchar*', clBufferImageData);

	// create queue
	if (cl.createCommandQueueWithProperties !== undefined) {
		clQueue = cl.createCommandQueueWithProperties(clCtx, clBuildDevice, []); // OpenCL 2
	} else {
		clQueue = cl.createCommandQueue(clCtx, clBuildDevice, null); // OpenCL 1.x
	}

	process.stdout.write('enqueue writes\n');

	cl.enqueueWriteBuffer(clQueue, clBufferAlive[0], true, 0, cellAlive[inputIndex].byteLength, cellAlive[inputIndex], null);
	cl.enqueueWriteBuffer(clQueue, clBufferAlive[1], true, 0, cellAlive[outputIndex].byteLength, cellAlive[outputIndex], null);

	process.stdout.write('writes done\n');
}

function initGame() {

}


function initEvents() {
	window.addEventListener('resize', () => {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	});
}


// ----------- GAME LOOP

let lastLoopTime;
const timePerTick = 50; // ms
let timeSinceLastLoop = 0;
let tickCounter = 0;

function startGameLoop() {
	lastLoopTime = Date.now();
	if (!RUN_GAMELOOP_SYNC) {
		gameLoop();
	}
}

function gameLoop() {
	const now = Date.now();
	timeSinceLastLoop += now - lastLoopTime;
	lastLoopTime = now;

	while(timeSinceLastLoop > timePerTick) {
		if (GAMETICK_CL) {
			gameTickCl();
		} else {
			gameTick();
		}
		timeSinceLastLoop -= timePerTick;
	}

	if (!RUN_GAMELOOP_SYNC) {
		setTimeout(gameLoop, timePerTick - timeSinceLastLoop);
	}
}


function gameTickCl() {
	process.stdout.write('gametick cl\n');

	cl.setKernelArg(clKernelGol, 0, 'uchar*', clBufferAlive[inputIndex]);
	cl.setKernelArg(clKernelGol, 1, 'uchar*', clBufferAlive[outputIndex]);
	process.stdout.write('gametick cl 1\n');

	cl.enqueueNDRangeKernel(clQueue, clKernelGol, 1, null, [cellsTotal], null);
	process.stdout.write('gametick cl 2\n');

	cl.enqueueReadBuffer(clQueue, clBufferImageData, true, 0, imageData.byteLength, imageData);
	process.stdout.write('gametick cl done\n');

	inputIndex = !inputIndex + 0;
	outputIndex = !inputIndex + 0;
}

function gameTick() {
	tickCounter++;

	const input = cellAlive[inputIndex];
	const output = cellAlive[outputIndex];

	for (let i = 0, n = 0; i < cellsTotal; i++) {
		const sum =
			input[cellNeighbors[n++]]
			+ input[cellNeighbors[n++]]
			+ input[cellNeighbors[n++]]
			+ input[cellNeighbors[n++]]

			+ input[cellNeighbors[n++]]
			+ input[cellNeighbors[n++]]
			+ input[cellNeighbors[n++]]
			+ input[cellNeighbors[n++]];

		// sum < 2 -> !(sum & 4294967294)
		// sum > 3 -> (sum & 12)   4 bit set OR 8 bit set
		const newAlive = (sum === 3 || (sum === 2 && input[i])) + 0

		output[i] = newAlive;

		imageData[i * 4] = newAlive * 255;
	}

	// set computed value to red

	inputIndex = !inputIndex + 0;
	outputIndex = !inputIndex + 0;
}


// ----------- RENDER

function renderOpenGL() {
	gl.clearColor(1.0, 0.0, 0.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);


	gl.vertexAttribPointer(locPosition, 2, gl.FLOAT, false, 0, 0);

	gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
	gl.vertexAttribPointer(locTexCoord, 2, gl.FLOAT, false, 0, 0);


	// texture
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureWidth, textureHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.bindTexture(gl.TEXTURE_2D, null);

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture);

	gl.uniform1i(locSampler, 0);


	// draw
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexCoordBuffer);
	gl.drawArrays(gl.TRIANGLES, 0, 6);

	// console.log(electron.screen.getCursorScreenPoint());
}

function render() {
	window.requestAnimationFrame(render);

	if (RUN_GAMELOOP_SYNC) {
		gameLoop();
	}

	const now = Date.now();

	if (lastRenderTime) {
		frameTimes[frameTimesIndex] = now - lastRenderTime;

		frameTimesIndex = (frameTimesIndex + 1) % FRAMETIMES_TO_KEEP;

		if (frameTimes.length >= FRAMETIMES_TO_KEEP) {
			fps = 1000 * frameTimes.length / frameTimes.reduce((pv, cv) => pv + cv);

			// do not update every frame
			if ((frameTimesIndex % 5) === 0) {
				fpsDisplay.innerHTML = fps.toFixed(2);
			}
		}
	}

	lastRenderTime = now;

	if (INIT_OPENGL) {
		renderOpenGL();
	}
}


init();