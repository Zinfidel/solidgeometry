precision mediump float;

varying vec4 fColor;
uniform int RenderMode;
uniform int PickColor;

void main()
{
    if (RenderMode == 0) gl_FragColor = fColor;
    else gl_FragColor = vec4(float(PickColor) / 255.0, 0.0, 0.0, 1.0);
}