precision mediump float;

// our texture
uniform sampler2D u_sampler;

// the texCoords passed in from the vertex shader.
varying vec2 v_texCoord;

void main() {
	// gl_FragColor = vec4(gl_FragCoord.x / 640.0, gl_FragCoord.y / 480.0, 0, 1);
	gl_FragColor = texture2D(u_sampler, v_texCoord);
}