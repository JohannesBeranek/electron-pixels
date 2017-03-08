const fs = require('fs');
const electron = require('electron');
const cl = require('node-opencl');


let canvas;  // canvas dom element
let gl;      // opengl context
let clCtx;   // opencl context
let program; // opengl shader program

let locPosition;  // location of position variable in frag shader
let locTexCoord;  // location of texture coords variable in frag shader
let locSampler;   // location of sampler in frag shader

let vertexCoordBuffer;   // buffer for vertext coordinates

let texCoordBuffer;      // buffer for texture coordinate
let texture;             // texture

let imageData;           // uint8array for texture data

let textureWidth = 640;
let textureHeight = 480;

const bytesPerPixel = 4; // bytes per pixel in imageData: R,G,B,A

function init() {
	canvas = document.getElementById('glscreen');
	gl = canvas.getContext('experimental-webgl');
	canvas.width = 640;
	canvas.height = 480;
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
	gl.shaderSource(vertexShader, fs.readFileSync(__dirname + '/shader-vertex.glsl'));
	gl.compileShader(vertexShader);
	console.log('vertexShaderLog', gl.getShaderInfoLog(vertexShader));

	const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragmentShader, fs.readFileSync(__dirname + '/shader-fragment.glsl'));
	gl.compileShader(fragmentShader);
	console.log('fragmentShaderLog', gl.getShaderInfoLog(fragmentShader));


	program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	console.log('programLog', gl.getProgramInfoLog(program));

	gl.useProgram(program);

	// ---
	locPosition = gl.getAttribLocation(program, 'a_position');
	gl.enableVertexAttribArray(locPosition);

	// provide texture coordinates for the rectangle.
  	locTexCoord = gl.getAttribLocation(program, 'a_texCoord');
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

	imageData = new Uint8Array(textureWidth * textureHeight * bytesPerPixel);

	// init texture to be all solid
	for (let i = 0; i < textureWidth * textureHeight; i++) {
		const offset = i * bytesPerPixel;
		imageData[offset + 3] = 255;
	}

	texture = gl.createTexture();

	locSampler = gl.getUniformLocation(program, 'u_sampler');

	// --- Init opencl
	const platforms = cl.getPlatformIDs();
	for(let i = 0; i < platforms.length; i++)
		console.info(`Platform ${i}: ${cl.getPlatformInfo(platforms[i], cl.PLATFORM_NAME)}`);

	const platform = platforms[0];

	const devices = cl.getDeviceIDs(platform, cl.DEVICE_TYPE_ALL);
	for(let i = 0; i < devices.length; i++)
		console.info(`  Devices ${i}: ${cl.getDeviceInfo(devices[i], cl.DEVICE_NAME)}`);

	console.info('creating context');

	clCtx = cl.createContext([cl.CONTEXT_PLATFORM, platform], devices);

	startGameLoop();
	render();
}


// ----------- GAME LOOP

let lastLoopTime;
const timePerTick = 1000; // ms
let timeSinceLastLoop = 0;

function startGameLoop() {
	lastLoopTime = Date.now();
	gameLoop();
}

function gameLoop() {
	const now = Date.now();
	timeSinceLastLoop += now - lastLoopTime;
	lastLoopTime = now;

	while(timeSinceLastLoop > timePerTick) {
		gameTick();
		timeSinceLastLoop -= timePerTick;
	}

	setTimeout(gameLoop, timePerTick - timeSinceLastLoop);
}

function gameTick() {

}


// ----------- RENDER

function render() {
	window.requestAnimationFrame(render, canvas);
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

init();