attribute vec4 vPosition;

varying vec4 fColor;

uniform vec4 Color;
uniform vec4 Normal;
uniform vec4 Light;
uniform mat4 Instance;
uniform mat4 NormalMatrix;
uniform mat4 ModelView;
uniform mat4 Projection;

void main()
{
    vec4 L = normalize(Light);
    vec4 N = normalize(ModelView * NormalMatrix * Normal);
    float Kd = max(dot(L, N), 0.0) + 0.2;
    gl_Position = Projection * ModelView * Instance * vPosition;
    fColor = vec4(Kd * Color.rgb, Color.a);
}