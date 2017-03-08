const fs = require('fs');

const electron = require('electron');

let canvas;
let gl;
let program;

let locPosition;
let locTexCoord;
let locSampler;

let vertexCoordBuffer;

let texCoordBuffer;
let texture;

let imageData;

let textureWidth = 640;
let textureHeight = 480;

const bytesPerPixel = 4;

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

	for (let i = 0; i < textureWidth * textureHeight; i++) {
		imageData[i*bytesPerPixel + 0] = 255;
	}

	texture = gl.createTexture();


	locSampler = gl.getUniformLocation(program, 'u_sampler');

	render();
}

function render() {
	window.requestAnimationFrame(render, canvas);
	gl.clearColor(1.0, 0.0, 0.0, 1.0);
   gl.clear(gl.COLOR_BUFFER_BIT);


	gl.vertexAttribPointer(locPosition, 2, gl.FLOAT, false, 0, 0);

	gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
	gl.vertexAttribPointer(locTexCoord, 2, gl.FLOAT, false, 0, 0);


	// texture
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture);

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureWidth, textureHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);


	gl.uniform1i(locSampler, 0);


	// draw
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexCoordBuffer);
	gl.drawArrays(gl.TRIANGLES, 0, 6);

	// console.log(electron.screen.getCursorScreenPoint());
}

init();