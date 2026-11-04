    // =========================================================================
    // 2. PHYSICAL HAIR BSDF & HYBRID GPU FUR SHADERS (64 SHELLS + 60K STRANDS)
    // =========================================================================
    const COMMON_HAIR_BSDF_GLSL = `
      uniform vec3 uBaseColor;
      uniform vec3 uTipColor;
      uniform float uRoughness;
      uniform float uSpecular;
      uniform float uFurDensity;
      uniform vec3 uKeyLightDir;
      uniform vec3 uKeyLightColor;
      uniform float uKeyLightIntensity;
      uniform vec3 uRimLightDir;
      uniform vec3 uRimLightColor;
      uniform float uRimIntensity;
      uniform float uAmbientIntensity;
      uniform float uVoiceGlow;

      vec3 shiftTangent(vec3 T, vec3 N, float shift) {
        return normalize(T + N * shift);
      }

      float hairSpecularLobe(vec3 T, vec3 N, vec3 V, vec3 L, float roughness) {
        vec3 H = normalize(L + V + vec3(1e-6, 1e-6, 1e-6));
        float dotTH = clamp(dot(T, H), -1.0, 1.0);
        float sinTH = sqrt(max(1e-5, 1.0 - dotTH * dotTH));
        float hemiVis = smoothstep(-0.25, 0.15, dot(N, L));
        float exponent = mix(220.0, 10.0, clamp(roughness * roughness, 0.0, 1.0));
        float normFactor = (exponent + 2.0) / 8.0;
        return hemiVis * pow(sinTH, exponent) * normFactor * 0.095;
      }

      vec3 evaluatePhysicalHairShading(
        vec3 worldPos,
        vec3 surfNormal,
        vec3 hairTangent,
        float h,
        float strandSeed,
        float combMemory
      ) {
        vec3 N = normalize(surfNormal);
        vec3 T = normalize(hairTangent);
        vec3 V = normalize(cameraPosition - worldPos);
        vec3 L = normalize(uKeyLightDir);
        vec3 Lrim = normalize(uRimLightDir);

        float rootTipMix = smoothstep(0.05, 0.92, pow(h, 0.82));
        vec3 strandTint = mix(vec3(0.92), vec3(1.08), fract(strandSeed * 13.37));
        vec3 albedo = mix(uBaseColor, uTipColor, rootTipMix) * strandTint;

        float follicleAO = mix(0.20, 1.0, pow(clamp(h, 0.0, 1.0), 0.72));

        float NdotL = dot(N, L);
        float opticalDepth = (1.0 - h) * (0.45 + 0.55 * uFurDensity) / max(0.22, NdotL * 0.5 + 0.55);
        float deepShadow = exp(-opticalDepth * 1.45);
        float wrapDiffuse = clamp((NdotL + 0.45) / 1.45, 0.0, 1.0);

        float sheenBoost = 1.0 + combMemory * 0.4 + uVoiceGlow * 0.35;
        vec3 tPrimary = shiftTangent(T, N, -0.16 + (strandSeed - 0.5) * 0.05);
        float specR = hairSpecularLobe(tPrimary, N, V, L, uRoughness) * uSpecular * sheenBoost;
        vec3 colorR = specR * uKeyLightColor * mix(vec3(1.0), albedo, 0.15);

        vec3 tSecondary = shiftTangent(T, N, 0.24 + (strandSeed - 0.5) * 0.08);
        float glint = 0.75 + 0.5 * sin(strandSeed * 62.83);
        float specTRT = hairSpecularLobe(tSecondary, N, V, L, min(1.0, uRoughness * 1.35)) * uSpecular * 0.85 * glint;
        vec3 colorTRT = specTRT * mix(albedo, uTipColor, 0.65) * uKeyLightColor * 1.65;

        float forwardKey = pow(clamp(dot(V, -L + N * 0.35), 0.0, 1.0), 3.2);
        float forwardRim = pow(clamp(dot(V, -Lrim + N * 0.4), 0.0, 1.0), 2.4);
        float fresnelRim = pow(1.0 - max(0.0, dot(N, V)), 2.5);
        float activeRim = uRimIntensity * (1.0 + uVoiceGlow * 0.65);
        vec3 scatterTT = (
          forwardKey * uKeyLightColor * 0.38 +
          (forwardRim * 0.75 + fresnelRim * 0.72) * uRimLightColor * activeRim
        ) * mix(uBaseColor, uTipColor, 0.78) * (0.35 + 0.65 * h);

        vec3 skyColor = mix(uTipColor, vec3(0.88, 0.92, 1.0), 0.55);
        vec3 groundColor = uBaseColor * 0.32;
        vec3 hemiFill = mix(groundColor, skyColor, N.y * 0.5 + 0.5) * uAmbientIntensity;

        vec3 balancedKeyTint = mix(vec3(1.0), uKeyLightColor, 0.58);
        vec3 directDiffuse = albedo * balancedKeyTint * uKeyLightIntensity * wrapDiffuse * deepShadow;
        vec3 directSpec = (colorR + colorTRT) * uKeyLightIntensity * deepShadow * (0.25 + 0.75 * h);
        vec3 ambientTerm = albedo * hemiFill * follicleAO;

        // Subtle bioluminescent tip glow when Argon speaks or vibes
        vec3 voiceTipPulse = uTipColor * (uVoiceGlow * 0.28 * pow(h, 2.0) * fresnelRim);

        return directDiffuse + directSpec + scatterTT + ambientTerm + voiceTipPulse;
      }
    `;

    const SHELL_VERTEX_SHADER = `
      attribute float aFollicleMask;
      attribute vec3 aGroomTangent;
      attribute float aShellIndex;

      uniform sampler2D uPhysicsTex;
      uniform float uFurLength;
      uniform float uClumping;
      uniform float uCurliness;
      uniform float uTime;
      uniform float uWindStrength;
      uniform vec3 uPointerLocalPos;
      uniform float uPointerActive;
      uniform float uGpuFurMode;
      uniform float uShellCountScale;
      uniform vec3 uWebGLInertia;
      uniform float uBoopShockwave;
      uniform float uVoiceGlow;

      varying float vLayerHeight;
      varying float vFollicleMask;
      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vSurfNormal;
      varying vec3 vHairTangent;
      varying float vCombMemory;

      vec2 normalToSphericalUV(vec3 n) {
        vec3 d = normalize(n);
        float u = atan(d.x, d.z) / (2.0 * 3.14159265) + 0.5;
        float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
        return vec2(u, v);
      }

      void main() {
        float h = clamp(aShellIndex * uShellCountScale, 0.0, 1.0);
        vLayerHeight = h;
        vFollicleMask = aFollicleMask;
        vLocalPos = position;

        vec3 localNormal = normalize(normal);
        vec3 groomDir = normalize(aGroomTangent);
        vec3 sideDir = normalize(cross(localNormal, groomDir) + vec3(1e-4, 0.0, 0.0));

        vec3 gpuDisp = vec3(0.0);
        vCombMemory = 0.0;
        if (uGpuFurMode > 0.5) {
          vec2 simUV = normalToSphericalUV(localNormal);
          vec4 gpgpuData = texture2D(uPhysicsTex, simUV);
          gpuDisp = gpgpuData.xyz;
          vCombMemory = gpgpuData.w;
        } else {
          vec3 tangInertia = uWebGLInertia - localNormal * min(0.0, dot(uWebGLInertia, localNormal));
          gpuDisp = tangInertia;
          if (uBoopShockwave > 0.01) {
            float waveFront = (1.0 - uBoopShockwave) * 2.2;
            float dFront = abs(distance(localNormal, vec3(0.0, 0.1, 0.98)) - waveFront);
            if (dFront < 0.38) {
              float ripple = (1.0 - dFront / 0.38) * uBoopShockwave;
              vec3 radial = normalize(localNormal - vec3(0.0, 0.1, 0.98) + vec3(0.0, 1e-4, 0.0));
              gpuDisp += radial * ripple * 0.65;
            }
          }
          if (uPointerActive > 0.5) {
            float pDist = distance(position, uPointerLocalPos);
            if (pDist < 0.45) {
              vCombMemory = (1.0 - pDist / 0.45) * 0.65;
            }
          }
        }

        float bendFactor = pow(h, 1.55);
        float activeWind = uWindStrength + uVoiceGlow * 0.45;
        vec3 windWave = vec3(
          sin(position.y * 4.2 + uTime * 2.6) * 0.08,
          cos(position.x * 3.8 + uTime * 2.1) * 0.04,
          cos(position.z * 4.0 - uTime * 2.4) * 0.08
        ) * activeWind;

        vec3 pointerPush = vec3(0.0);
        if (uPointerActive > 0.5) {
          float pDist = distance(position, uPointerLocalPos);
          if (pDist < 0.55) {
            vec3 away = normalize(position - uPointerLocalPos + vec3(0.0, 1e-4, 0.0));
            away -= localNormal * dot(away, localNormal);
            pointerPush = away * pow(1.0 - pDist / 0.55, 1.8) * 0.35;
          }
        }

        float effectiveLen = uFurLength * aFollicleMask * (1.0 + uVoiceGlow * 0.06);

        float lockPhase = dot(position, vec3(5.4, 6.2, 5.0));
        float curlFreq = mix(3.2, 7.8, uCurliness);
        float wavePhase = h * curlFreq + lockPhase;
        float smoothEnv = h * h * (3.0 - 2.0 * h);
        float waveAmp = uCurliness * effectiveLen * 0.28 * smoothEnv;
        vec3 waveOffset = (sideDir * sin(wavePhase) + groomDir * (cos(wavePhase) - 1.0) * 0.55) * waveAmp;
        vec3 waveTangent = (sideDir * cos(wavePhase) - groomDir * sin(wavePhase) * 0.55) * (waveAmp * curlFreq);

        vec3 totalOffset =
          localNormal * (h * effectiveLen) +
          groomDir * (bendFactor * effectiveLen * (0.28 + 0.18 * uClumping)) +
          waveOffset +
          (gpuDisp * 0.42 + windWave + pointerPush) * bendFactor * effectiveLen;

        vec3 displacedLocal = position + totalOffset;
        vec4 worldPosition = modelMatrix * vec4(displacedLocal, 1.0);
        vWorldPos = worldPosition.xyz;

        vSurfNormal = normalize(mat3(modelMatrix) * localNormal);
        vec3 localHairDir = normalize(
          localNormal * effectiveLen +
          groomDir * (1.55 * pow(max(0.05, h), 0.55) * effectiveLen * 0.35) +
          waveTangent +
          (gpuDisp * 0.42 + windWave + pointerPush) * 1.55 * pow(max(0.05, h), 0.55)
        );
        vHairTangent = normalize(mat3(modelMatrix) * localHairDir);

        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;

    const SHELL_FRAGMENT_SHADER = `
      ${COMMON_HAIR_BSDF_GLSL}

      uniform float uClumping;
      uniform float uCurliness;
      uniform float uGpuFurMode;

      varying float vLayerHeight;
      varying float vFollicleMask;
      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vSurfNormal;
      varying vec3 vHairTangent;
      varying float vCombMemory;

      vec2 octahedralUV(vec3 n) {
        vec3 d = n / (abs(n.x) + abs(n.y) + abs(n.z) + 1e-6);
        vec2 oct = d.y >= 0.0
          ? d.xz
          : (1.0 - abs(d.zx)) * vec2(d.x >= 0.0 ? 1.0 : -1.0, d.z >= 0.0 ? 1.0 : -1.0);
        return oct * 0.5 + 0.5;
      }

      vec3 hash23(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
        p3 += dot(p3, p3.yzx + 19.19);
        return fract((p3.xxz + p3.yxx) * p3.zyx);
      }

      void main() {
        if (vFollicleMask < 0.04) {
          discard;
        }

        float gridScale = mix(52.0, 96.0, clamp(uFurDensity, 0.0, 1.0));
        vec2 baseUV = octahedralUV(normalize(vLocalPos));
        vec2 warpedUV = baseUV + 0.008 * sin(baseUV.yx * 28.0);
        vec2 sampleUV = warpedUV * gridScale;

        vec2 clumpGrid = warpedUV * (gridScale * 0.24);
        vec2 clumpFract = fract(clumpGrid) - 0.5;
        sampleUV -= clumpFract * (vLayerHeight * uClumping * 1.65);

        vec2 cellId = floor(sampleUV);
        vec2 cellLocal = fract(sampleUV) - 0.5;
        vec3 rand = hash23(cellId);

        float densityFactor = clamp(uFurDensity * 1.08, 0.22, 1.0) * clamp(vFollicleMask * 1.15, 0.0, 1.0);
        float fiberMaxH = mix(0.32, 1.0, rand.z) * densityFactor;
        if (vLayerHeight > fiberMaxH) {
          discard;
        }

        float curlFreq = mix(3.2, 7.8, uCurliness);
        float curlAngle = vLayerHeight * curlFreq + rand.x * 6.28318;
        float smoothEnv = vLayerHeight * vLayerHeight * (3.0 - 2.0 * vLayerHeight);
        float curlRadius = (0.03 * uClumping + 0.12 * uCurliness) * smoothEnv;
        vec2 strandCenter = (rand.xy - 0.5) * 0.22 + vec2(cos(curlAngle), sin(curlAngle)) * curlRadius;
        float distToAxis = length(cellLocal - strandCenter);

        float normH = clamp(vLayerHeight / max(0.15, fiberMaxH), 0.0, 1.0);
        float maxRadius = 0.62 * (1.0 - pow(normH, 1.25));
        if (distToAxis > maxRadius) {
          discard;
        }

        vec3 color = evaluatePhysicalHairShading(
          vWorldPos,
          vSurfNormal,
          vHairTangent,
          vLayerHeight,
          rand.x,
          vCombMemory
        );

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const STRAND_VERTEX_SHADER = `
      attribute vec3 aRootPos;
      attribute vec3 aRootNormal;
      attribute vec3 aGroomDir;
      attribute vec3 aClumpOffset;
      attribute float aStrandSeed;
      attribute float aMaskValue;

      uniform sampler2D uPhysicsTex;
      uniform float uFurLength;
      uniform float uFurDensity;
      uniform float uClumping;
      uniform float uCurliness;
      uniform float uTime;
      uniform float uWindStrength;
      uniform vec3 uPointerLocalPos;
      uniform float uPointerActive;
      uniform float uGpuFurMode;
      uniform vec3 uWebGLInertia;
      uniform float uBoopShockwave;
      uniform float uVoiceGlow;

      varying float vHeight;
      varying float vRibbonU;
      varying float vStrandSeed;
      varying vec3 vWorldPos;
      varying vec3 vSurfNormal;
      varying vec3 vHairTangent;
      varying float vCombMemory;

      vec2 normalToSphericalUV(vec3 n) {
        vec3 d = normalize(n);
        float u = atan(d.x, d.z) / (2.0 * 3.14159265) + 0.5;
        float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
        return vec2(u, v);
      }

      void main() {
        float h = position.y;
        vHeight = h;
        vRibbonU = position.x;
        vStrandSeed = aStrandSeed;

        if (aStrandSeed > uFurDensity || aMaskValue < 0.05) {
          gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
          return;
        }

        vec3 N = normalize(aRootNormal);
        vec3 G = normalize(aGroomDir);
        vec3 sideVec = normalize(cross(N, G) + vec3(1e-4, 0.0, 0.0));

        vec3 gpuDisp = vec3(0.0);
        vCombMemory = 0.0;
        if (uGpuFurMode > 0.5) {
          vec2 simUV = normalToSphericalUV(N);
          vec4 gpgpuData = texture2D(uPhysicsTex, simUV);
          gpuDisp = gpgpuData.xyz;
          vCombMemory = gpgpuData.w;
        } else {
          gpuDisp = uWebGLInertia - N * min(0.0, dot(uWebGLInertia, N));
          if (uBoopShockwave > 0.01) {
            float waveFront = (1.0 - uBoopShockwave) * 2.2;
            float dFront = abs(distance(N, vec3(0.0, 0.1, 0.98)) - waveFront);
            if (dFront < 0.38) {
              float ripple = (1.0 - dFront / 0.38) * uBoopShockwave;
              vec3 radial = normalize(N - vec3(0.0, 0.1, 0.98) + vec3(0.0, 1e-4, 0.0));
              gpuDisp += radial * ripple * 0.65;
            }
          }
          if (uPointerActive > 0.5) {
            float pDist = distance(aRootPos, uPointerLocalPos);
            if (pDist < 0.45) {
              vCombMemory = (1.0 - pDist / 0.45) * 0.65;
            }
          }
        }

        float lenVariation = 0.82 + 0.36 * fract(aStrandSeed * 17.31);
        float totalLen = uFurLength * aMaskValue * lenVariation * 1.15 * (1.0 + uVoiceGlow * 0.07);

        float bend = pow(h, 1.55);
        float smoothEnv = h * h * (3.0 - 2.0 * h);

        float activeWind = uWindStrength + uVoiceGlow * 0.45;
        vec3 windWave = vec3(
          sin(aRootPos.y * 4.4 + uTime * 2.7 + aStrandSeed * 3.14) * 0.08,
          cos(aRootPos.x * 3.9 + uTime * 2.2) * 0.04,
          cos(aRootPos.z * 4.1 - uTime * 2.5 + aStrandSeed * 3.14) * 0.08
        ) * activeWind;

        vec3 pointerPush = vec3(0.0);
        if (uPointerActive > 0.5) {
          float pDist = distance(aRootPos, uPointerLocalPos);
          if (pDist < 0.58) {
            vec3 away = normalize(aRootPos - uPointerLocalPos + vec3(0.0, 1e-4, 0.0));
            away -= N * dot(away, N);
            pointerPush = away * pow(1.0 - pDist / 0.58, 1.8) * 0.42;
          }
        }

        vec3 tuftAnchor = aRootPos + aClumpOffset;
        float coherentPhase = dot(tuftAnchor, vec3(5.4, 6.2, 5.0)) + (fract(aStrandSeed * 43.17) - 0.5) * 0.65;
        float curlFreq = mix(3.2, 8.2, uCurliness);
        float spiralAngle = h * curlFreq + coherentPhase;

        float curlAmp = uCurliness * totalLen * 0.34 * smoothEnv;
        vec3 curlOffset =
          sideVec * (sin(spiralAngle) - sin(coherentPhase)) * curlAmp +
          G * (cos(spiralAngle) - cos(coherentPhase)) * (curlAmp * 0.65);

        vec3 curlTangent =
          (sideVec * cos(spiralAngle) - G * sin(spiralAngle) * 0.65) * (curlAmp * curlFreq);

        vec3 clumpPull = aClumpOffset * (smoothEnv * uClumping * totalLen * 0.68);

        vec3 spineLocal =
          aRootPos +
          N * (h * totalLen) +
          G * (bend * totalLen * 0.34) +
          clumpPull +
          curlOffset +
          (gpuDisp * 0.48 + windWave + pointerPush) * bend * totalLen;

        vec3 localTangent = normalize(
          N * totalLen +
          G * (1.55 * pow(max(0.05, h), 0.55) * totalLen * 0.34) +
          clumpPull * 1.15 +
          curlTangent +
          (gpuDisp * 0.48 + windWave + pointerPush) * 1.55 * pow(max(0.05, h), 0.55)
        );

        vec3 worldSpine = (modelMatrix * vec4(spineLocal, 1.0)).xyz;
        vec3 worldTangent = normalize(mat3(modelMatrix) * localTangent);
        vSurfNormal = normalize(mat3(modelMatrix) * N);
        vHairTangent = worldTangent;

        vec3 viewDir = normalize(cameraPosition - worldSpine);
        vec3 billboardRight = normalize(cross(worldTangent, viewDir) + vec3(1e-5, 0.0, 0.0));

        float modelScale = length(modelMatrix[0].xyz);
        float modeWidthBoost = mix(1.38, 1.0, uGpuFurMode);
        float baseWidth = 0.0145 * modeWidthBoost * (0.82 + 0.38 * (1.0 - uFurDensity)) * modelScale;
        float width = baseWidth * (1.0 - pow(h, 1.35));

        vec3 finalWorld = worldSpine + billboardRight * (position.x * width);
        vWorldPos = finalWorld;

        gl_Position = projectionMatrix * viewMatrix * vec4(finalWorld, 1.0);
      }
    `;

    const STRAND_FRAGMENT_SHADER = `
      ${COMMON_HAIR_BSDF_GLSL}

      varying float vHeight;
      varying float vRibbonU;
      varying float vStrandSeed;
      varying vec3 vWorldPos;
      varying vec3 vSurfNormal;
      varying vec3 vHairTangent;
      varying float vCombMemory;

      void main() {
        vec3 color = evaluatePhysicalHairShading(
          vWorldPos,
          vSurfNormal,
          vHairTangent,
          vHeight,
          vStrandSeed,
          vCombMemory
        );

        float radialDist = abs(vRibbonU);
        float cylinderRoundness = sqrt(max(0.18, 1.0 - radialDist * radialDist * 0.82));
        color *= (0.82 + 0.24 * cylinderRoundness);

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // =========================================================================
    // 3. PING-PONG GPGPU VERLET PHYSICS ENGINE (STANDALONE THREE.JS)
    // =========================================================================
    const SIM_SIZE = 128;

    const GPGPU_PASS_VERT = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const VELOCITY_FRAGMENT_SHADER = `
      uniform vec2 resolution;
      uniform sampler2D texturePosition;
      uniform sampler2D textureVelocity;
      uniform float uTime;
      uniform float uDelta;
      uniform float uStiffness;
      uniform float uDamping;
      uniform float uGravity;
      uniform float uWindStrength;
      uniform vec3 uCreatureVelocity;
      uniform vec3 uCreatureAngularVel;
      uniform vec3 uPointerLocalPos;
      uniform vec3 uPointerVelocity;
      uniform float uPointerActive;
      uniform float uBoopShockwave;

      vec3 windField(vec3 p, float t) {
        float wx = sin(p.y * 3.1 + t * 2.4) * cos(p.z * 2.7 + t * 1.9)
                 + 0.5 * sin(p.z * 6.3 - t * 4.1);
        float wy = 0.35 * cos(p.x * 3.5 + t * 2.1) * sin(p.z * 2.9 + t * 1.7);
        float wz = cos(p.x * 2.8 - t * 2.2) * sin(p.y * 3.4 + t * 2.0);
        return vec3(wx, wy, wz);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        float theta = (uv.x * 2.0 - 1.0) * 3.14159265;
        float phi = (1.0 - uv.y) * 3.14159265;
        vec3 surfNormal = normalize(vec3(
          sin(phi) * sin(theta),
          cos(phi),
          sin(phi) * cos(theta)
        ));

        vec4 posData = texture2D(texturePosition, uv);
        vec4 velData = texture2D(textureVelocity, uv);
        vec3 disp = posData.xyz;
        float combMemory = posData.w;
        vec3 vel = velData.xyz;

        float dt = clamp(uDelta, 0.001, 0.033);

        vec3 force = -uStiffness * disp;

        vec3 gravVec = vec3(0.0, -uGravity, 0.0);
        vec3 tangentGravity = gravVec - surfNormal * min(0.0, dot(gravVec, surfNormal));
        force += tangentGravity;

        vec3 linearInertia = -uCreatureVelocity * 1.85;
        vec3 rotationalInertia = -cross(uCreatureAngularVel, surfNormal) * 2.2;
        force += linearInertia + rotationalInertia;

        vec3 wind = windField(surfNormal * 1.4, uTime) * uWindStrength;
        force += wind;

        if (uPointerActive > 0.5) {
          float dist = distance(surfNormal, normalize(uPointerLocalPos + vec3(0.0, 0.0, 1e-5)));
          if (dist < 0.55) {
            float falloff = pow(1.0 - dist / 0.55, 2.0);
            vec3 partDir = normalize(surfNormal - normalize(uPointerLocalPos) + vec3(0.0, 1e-4, 0.0));
            vec3 strokeImpulse = uPointerVelocity * 2.8 + partDir * 3.4;
            strokeImpulse -= surfNormal * dot(strokeImpulse, surfNormal);
            force += strokeImpulse * falloff * 18.0;
          }
        }

        if (uBoopShockwave > 0.01) {
          float waveFront = (1.0 - uBoopShockwave) * 2.2;
          float dFront = abs(distance(surfNormal, vec3(0.0, 0.1, 0.98)) - waveFront);
          if (dFront < 0.35) {
            float ripple = (1.0 - dFront / 0.35) * uBoopShockwave;
            vec3 radial = normalize(surfNormal - vec3(0.0, 0.1, 0.98) + vec3(0.0, 1e-4, 0.0));
            force += radial * ripple * 22.0;
          }
        }

        vel = (vel + force * dt) * exp(-uDamping * dt);
        float speed = length(vel);
        if (speed > 6.0) {
          vel = (vel / speed) * 6.0;
        }

        gl_FragColor = vec4(vel, combMemory);
      }
    `;

    const POSITION_FRAGMENT_SHADER = `
      uniform vec2 resolution;
      uniform sampler2D texturePosition;
      uniform sampler2D textureVelocity;
      uniform float uDelta;
      uniform vec3 uPointerLocalPos;
      uniform float uPointerActive;

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        float theta = (uv.x * 2.0 - 1.0) * 3.14159265;
        float phi = (1.0 - uv.y) * 3.14159265;
        vec3 surfNormal = normalize(vec3(
          sin(phi) * sin(theta),
          cos(phi),
          sin(phi) * cos(theta)
        ));

        vec4 posData = texture2D(texturePosition, uv);
        vec4 velData = texture2D(textureVelocity, uv);
        vec3 disp = posData.xyz;
        float combMemory = posData.w;
        vec3 vel = velData.xyz;

        float dt = clamp(uDelta, 0.001, 0.033);
        disp += vel * dt;

        float inward = dot(disp, surfNormal);
        if (inward < -0.15) {
          disp -= surfNormal * (inward + 0.15);
        }

        float maxDisp = 0.85;
        float dLen = length(disp);
        if (dLen > maxDisp) {
          disp = (disp / dLen) * maxDisp;
        }

        combMemory *= exp(-dt * 1.2);
        if (uPointerActive > 0.5) {
          float dist = distance(surfNormal, normalize(uPointerLocalPos + vec3(0.0, 0.0, 1e-5)));
          if (dist < 0.45) {
            combMemory = min(1.0, combMemory + (1.0 - dist / 0.45) * dt * 8.0);
          }
        }

        gl_FragColor = vec4(disp, combMemory);
      }
    `;

    function createGPUFurPhysics(renderer) {
      const fallbackData = new Float32Array(4 * 4 * 4);
      const fallbackTexture = new THREE.DataTexture(
        fallbackData,
        4,
        4,
        THREE.RGBAFormat,
        THREE.FloatType
      );
      fallbackTexture.needsUpdate = true;

      let isGPGPUActive = false;
      let posTargets = [];
      let velTargets = [];
      let pingPongIdx = 0;
      let velMat = null;
      let posMat = null;
      let passScene = null;
      let passCam = null;
      let passMesh = null;

      try {
        const gl = renderer.getContext();
        const isWebGL2 = Boolean(renderer.capabilities && renderer.capabilities.isWebGL2);
        const hasHalfFloat = isWebGL2 || Boolean(gl.getExtension('OES_texture_half_float'));
        const hasColorBufferFloat = isWebGL2
          ? Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
          : Boolean(gl.getExtension('WEBGL_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));

        if (hasHalfFloat && hasColorBufferFloat) {
          const rtOptions = {
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
          };

          posTargets = [
            new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOptions),
            new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOptions)
          ];
          velTargets = [
            new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOptions),
            new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOptions)
          ];

          passScene = new THREE.Scene();
          passCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

          velMat = new THREE.ShaderMaterial({
            vertexShader: GPGPU_PASS_VERT,
            fragmentShader: VELOCITY_FRAGMENT_SHADER,
            uniforms: {
              resolution: { value: new THREE.Vector2(SIM_SIZE, SIM_SIZE) },
              texturePosition: { value: fallbackTexture },
              textureVelocity: { value: fallbackTexture },
              uTime: { value: 0.0 },
              uDelta: { value: 0.016 },
              uStiffness: { value: 26.0 },
              uDamping: { value: 5.2 },
              uGravity: { value: 2.8 },
              uWindStrength: { value: 1.2 },
              uCreatureVelocity: { value: new THREE.Vector3() },
              uCreatureAngularVel: { value: new THREE.Vector3() },
              uPointerLocalPos: { value: new THREE.Vector3(0, 0, 1) },
              uPointerVelocity: { value: new THREE.Vector3() },
              uPointerActive: { value: 0.0 },
              uBoopShockwave: { value: 0.0 }
            }
          });

          posMat = new THREE.ShaderMaterial({
            vertexShader: GPGPU_PASS_VERT,
            fragmentShader: POSITION_FRAGMENT_SHADER,
            uniforms: {
              resolution: { value: new THREE.Vector2(SIM_SIZE, SIM_SIZE) },
              texturePosition: { value: fallbackTexture },
              textureVelocity: { value: fallbackTexture },
              uDelta: { value: 0.016 },
              uPointerLocalPos: { value: new THREE.Vector3(0, 0, 1) },
              uPointerActive: { value: 0.0 }
            }
          });

          passMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), velMat);
          passScene.add(passMesh);
          isGPGPUActive = true;
        }
      } catch (err) {
        isGPGPUActive = false;
      }

      function step({
        time,
        dt,
        windStrength,
        creatureVelocity,
        creatureAngularVel,
        pointerLocalPos,
        pointerVelocity,
        pointerActive,
        boopShockwave
      }) {
        if (!isGPGPUActive) {
          return fallbackTexture;
        }

        const readIdx = pingPongIdx;
        const writeIdx = 1 - pingPongIdx;

        const vUni = velMat.uniforms;
        vUni.texturePosition.value = posTargets[readIdx].texture;
        vUni.textureVelocity.value = velTargets[readIdx].texture;
        vUni.uTime.value = time;
        vUni.uDelta.value = dt;
        vUni.uWindStrength.value = windStrength;
        vUni.uCreatureVelocity.value.copy(creatureVelocity);
        vUni.uCreatureAngularVel.value.copy(creatureAngularVel);
        vUni.uPointerLocalPos.value.copy(pointerLocalPos);
        vUni.uPointerVelocity.value.copy(pointerVelocity);
        vUni.uPointerActive.value = pointerActive ? 1.0 : 0.0;
        vUni.uBoopShockwave.value = boopShockwave;

        const prevTarget = renderer.getRenderTarget();
        passMesh.material = velMat;
        renderer.setRenderTarget(velTargets[writeIdx]);
        renderer.render(passScene, passCam);

        const pUni = posMat.uniforms;
        pUni.texturePosition.value = posTargets[readIdx].texture;
        pUni.textureVelocity.value = velTargets[writeIdx].texture;
        pUni.uDelta.value = dt;
        pUni.uPointerLocalPos.value.copy(pointerLocalPos);
        pUni.uPointerActive.value = pointerActive ? 1.0 : 0.0;

        passMesh.material = posMat;
        renderer.setRenderTarget(posTargets[writeIdx]);
        renderer.render(passScene, passCam);

        renderer.setRenderTarget(prevTarget);
        pingPongIdx = writeIdx;
        return posTargets[writeIdx].texture;
      }

      return {
        step,
        isGPGPUActive,
        fallbackTexture
      };
    }

    // =========================================================================
    // 4. ARGON 3D FURRY CREATURE GEOMETRY, ANATOMY & TALKING FACIAL RIG
    // =========================================================================
    function smoothstep(edge0, edge1, x) {
      const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
      return t * t * (3.0 - 2.0 * t);
    }

    function normalize3(x, y, z) {
      const l = Math.sqrt(x * x + y * y + z * z) || 1.0;
      return [x / l, y / l, z / l];
    }

    function evaluateFollicleMask(x, y, z) {
      const lx = x + 0.31;
      const rx = x - 0.31;
      const ey = y - 0.16;
      const ez = z - 0.88;

      const distLeftEye = Math.sqrt(lx * lx + ey * ey * 1.1 + ez * ez);
      const distRightEye = Math.sqrt(rx * rx + ey * ey * 1.1 + ez * ez);
      const minEyeDist = Math.min(distLeftEye, distRightEye);

      if (minEyeDist < 0.145) {
        return 0.0;
      }
      const eyeMask = 0.28 + 0.72 * smoothstep(0.145, 0.25, minEyeDist);

      const mx = x / 1.25;
      const my = (y - 0.04) * 1.4;
      const mz = z - 0.96;
      const distMouth = Math.sqrt(mx * mx + my * my + mz * mz);
      const mouthMask = 0.22 + 0.78 * smoothstep(0.065, 0.16, distMouth);

      const bottomMask = smoothstep(-1.05, -0.72, y);

      const cheekDist = Math.min(
        Math.hypot(x + 0.56, y - 0.02, z - 0.68),
        Math.hypot(x - 0.56, y - 0.02, z - 0.68)
      );
      const cheekFluff = 1.0 + 0.22 * (1.0 - smoothstep(0.0, 0.42, cheekDist));

      return Math.max(0.0, Math.min(1.25, eyeMask * mouthMask * bottomMask * cheekFluff));
    }

    function evaluateGroomFlow(x, y, z, nx, ny, nz) {
      let fx = x * 0.25;
      let fy = -0.85;
      let fz = (z - 0.15) * 0.25;

      const eyeCenters = [
        [-0.33, 0.17, 0.86],
        [0.33, 0.17, 0.86]
      ];
      for (let i = 0; i < 2; i++) {
        const [ex, ey, ez] = eyeCenters[i];
        const dx = x - ex;
        const dy = y - ey;
        const dz = z - ez;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-5;
        if (d < 0.48) {
          const influence = (1.0 - d / 0.48) * 0.85;
          fx += (dx / d) * influence;
          fy += (dy / d) * influence * 0.6;
          fz += (dz / d) * influence * 0.3;
        }
      }

      const dotFN = fx * nx + fy * ny + fz * nz;
      let tx = fx - dotFN * nx;
      let ty = fy - dotFN * ny;
      let tz = fz - dotFN * nz;
      const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (len > 1e-5) {
        tx /= len;
        ty /= len;
        tz /= len;
      } else {
        tx = 1.0;
        ty = 0.0;
        tz = 0.0;
      }
      return [tx, ty, tz];
    }

    function sculptBlobPosition(u, v, w) {
      let x = u;
      let y = v;
      let z = w;

      const bellyWidth = 1.0 + 0.22 * Math.exp(-Math.pow((y + 0.24) / 0.55, 2.0));
      const cheekPuff = 1.0 + 0.14 * Math.exp(-Math.pow((y + 0.05) / 0.38, 2.0)) * Math.max(0, z);
      x *= bellyWidth * cheekPuff;
      z *= (0.94 + 0.12 * Math.exp(-Math.pow((y + 0.22) / 0.6, 2.0)));
      y *= 0.96;

      if (y < -0.55) {
        const t = (-0.55 - y) / 0.45;
        y = -0.55 - Math.tanh(t * 1.15) * 0.32;
      }

      const leftEarDir = normalize3(-0.46, 0.86, 0.06);
      const rightEarDir = normalize3(0.46, 0.86, 0.06);
      const dotLEar = Math.max(0.0, u * leftEarDir[0] + v * leftEarDir[1] + w * leftEarDir[2]);
      const dotREar = Math.max(0.0, u * rightEarDir[0] + v * rightEarDir[1] + w * rightEarDir[2]);
      const earProfile = Math.pow(Math.max(dotLEar, dotREar), 14.0) * 0.44;
      x += u * earProfile * 0.75;
      y += v * earProfile * 1.15;
      z += w * earProfile * 0.55;

      const leftArmDir = normalize3(-0.94, -0.08, 0.28);
      const rightArmDir = normalize3(0.94, -0.08, 0.28);
      const dotLArm = Math.max(0.0, u * leftArmDir[0] + v * leftArmDir[1] + w * leftArmDir[2]);
      const dotRArm = Math.max(0.0, u * rightArmDir[0] + v * rightArmDir[1] + w * rightArmDir[2]);
      const armProfile = Math.pow(Math.max(dotLArm, dotRArm), 18.0) * 0.24;
      x += u * armProfile * 1.1;
      y += v * armProfile * 0.6;
      z += w * armProfile * 0.9;

      const lx = x + 0.33;
      const rx = x - 0.33;
      const ey = y - 0.17;
      const ez = z - 0.86;
      const dEye = Math.min(
        Math.sqrt(lx * lx + ey * ey + ez * ez),
        Math.sqrt(rx * rx + ey * ey + ez * ez)
      );
      if (dEye < 0.32) {
        const indent = (1.0 - smoothstep(0.0, 0.32, dEye)) * 0.065;
        z -= indent;
      }

      return [x, y, z];
    }

    function createOrganicBlobGeometry(widthSegments = 96, heightSegments = 72) {
      const geom = new THREE.SphereGeometry(1.0, widthSegments, heightSegments);
      const posAttr = geom.attributes.position;
      const count = posAttr.count;

      for (let i = 0; i < count; i++) {
        const u = posAttr.getX(i);
        const v = posAttr.getY(i);
        const w = posAttr.getZ(i);
        const [sx, sy, sz] = sculptBlobPosition(u, v, w);
        posAttr.setXYZ(i, sx, sy, sz);
      }

      geom.computeVertexNormals();

      const normAttr = geom.attributes.normal;
      const follicleMaskArray = new Float32Array(count);
      const groomTangentArray = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        const nx = normAttr.getX(i);
        const ny = normAttr.getY(i);
        const nz = normAttr.getZ(i);

        follicleMaskArray[i] = evaluateFollicleMask(x, y, z);
        const [tx, ty, tz] = evaluateGroomFlow(x, y, z, nx, ny, nz);
        groomTangentArray[i * 3] = tx;
        groomTangentArray[i * 3 + 1] = ty;
        groomTangentArray[i * 3 + 2] = tz;
      }

      geom.setAttribute('aFollicleMask', new THREE.BufferAttribute(follicleMaskArray, 1));
      geom.setAttribute('aGroomTangent', new THREE.BufferAttribute(groomTangentArray, 3));
      return geom;
    }

    function createArgonCreature() {
      const root = new THREE.Group();
      root.name = 'ArgonCreature';

      const bodyGeometry = createOrganicBlobGeometry(96, 72);
      const skinMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#32195e'),
        roughness: 0.78,
        metalness: 0.02
      });

      const bodyMesh = new THREE.Mesh(bodyGeometry, skinMaterial);
      root.add(bodyMesh);

      const faceGroup = new THREE.Group();
      root.add(faceGroup);

      const eyeMaterial = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#0f0a19'),
        roughness: 0.04,
        metalness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        reflectivity: 1.0
      });

      const irisMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#4c2882')
      });

      const highlightMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffffff')
      });

      const warmHighlightMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffd6ec')
      });

      const eyes = [];
      for (const side of [-1, 1]) {
        const eyePivot = new THREE.Group();
        eyePivot.position.set(side * 0.31, 0.16, 0.94);
        eyePivot.rotation.y = side * 0.22;
        eyePivot.rotation.x = -0.06;

        const eyeballGeo = new THREE.SphereGeometry(0.17, 32, 24);
        eyeballGeo.scale(0.96, 1.08, 0.68);
        const eyeball = new THREE.Mesh(eyeballGeo, eyeMaterial);
        eyePivot.add(eyeball);

        const irisGeo = new THREE.SphereGeometry(0.12, 24, 16);
        irisGeo.scale(0.92, 0.95, 0.38);
        const iris = new THREE.Mesh(irisGeo, irisMaterial);
        iris.position.set(0, -0.02, 0.086);
        eyePivot.add(iris);

        const catchlightMainGeo = new THREE.SphereGeometry(0.046, 16, 12);
        catchlightMainGeo.scale(1.0, 1.18, 0.32);
        const catchlightMain = new THREE.Mesh(catchlightMainGeo, highlightMat);
        catchlightMain.position.set(-side * 0.042, 0.052, 0.112);
        eyePivot.add(catchlightMain);

        const catchlightSubGeo = new THREE.SphereGeometry(0.024, 14, 10);
        catchlightSubGeo.scale(1.0, 1.0, 0.32);
        const catchlightSub = new THREE.Mesh(catchlightSubGeo, warmHighlightMat);
        catchlightSub.position.set(side * 0.048, -0.052, 0.11);
        eyePivot.add(catchlightSub);

        faceGroup.add(eyePivot);
        eyes.push({
          pivot: eyePivot,
          catchlightMain,
          catchlightSub,
          side
        });
      }

      const blushMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ff5c93'),
        transparent: true,
        opacity: 0.58,
        depthWrite: false
      });

      for (const side of [-1, 1]) {
        const blushGeo = new THREE.SphereGeometry(0.12, 20, 16);
        blushGeo.scale(1.4, 0.75, 0.35);
        const blush = new THREE.Mesh(blushGeo, blushMat);
        blush.position.set(side * 0.49, 0.0, 0.96);
        blush.rotation.y = side * 0.34;
        blush.rotation.z = -side * 0.1;
        faceGroup.add(blush);
      }

      const noseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff94b8') });
      const noseGeo = new THREE.SphereGeometry(0.048, 18, 14);
      noseGeo.scale(1.3, 0.88, 0.75);
      const nose = new THREE.Mesh(noseGeo, noseMat);
      nose.position.set(0, 0.075, 1.05);
      faceGroup.add(nose);

      // W-mouth arcs + Expressive Talking Open Mouth Cavity
      const mouthGroup = new THREE.Group();
      faceGroup.add(mouthGroup);

      const mouthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2d0b28') });
      const mouthArcs = [];
      for (const side of [-1, 1]) {
        const arcGeo = new THREE.TorusGeometry(0.046, 0.013, 10, 20, Math.PI * 0.92);
        const arc = new THREE.Mesh(arcGeo, mouthMat);
        arc.position.set(side * 0.043, 0.035, 1.045);
        arc.rotation.x = Math.PI + 0.15;
        arc.rotation.y = side * 0.14;
        mouthGroup.add(arc);
        mouthArcs.push(arc);
      }

      // Inner warm pink-crimson talking mouth oval that scales open with speech cadence
      const openMouthGeo = new THREE.SphereGeometry(0.058, 20, 16);
      openMouthGeo.scale(1.15, 0.95, 0.35);
      const openMouthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff477e') });
      const openMouthMesh = new THREE.Mesh(openMouthGeo, openMouthMat);
      openMouthMesh.position.set(0, -0.018, 1.036);
      openMouthMesh.scale.set(0.1, 0.01, 0.1);
      openMouthMesh.visible = false;
      mouthGroup.add(openMouthMesh);

      const animState = {
        time: 0,
        blinkTimer: 0,
        nextBlink: 2.6,
        boopImpulse: 0,
        boopPhase: 0,
        danceSpinImpulse: 0,
        danceSpinAngle: 0,
        vibeIntensity: 0.25,
        speechOpen: 0.0,
        listeningLean: 0.0,
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        targetLook: new THREE.Vector2(0, 0),
        currentLook: new THREE.Vector2(0, 0)
      };

      function triggerBoop() {
        animState.boopImpulse = 1.0;
        animState.boopPhase = 0.0;
      }

      function triggerDanceSpin() {
        animState.danceSpinImpulse = 1.0;
        triggerBoop();
      }

      function update(dt, pointerNDC, cursorSpeed, speechLevel, isListening) {
        const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
        animState.time += safeDt;

        // Smooth eye & head tracking toward user cursor/touch anywhere on screen
        if (pointerNDC) {
          animState.targetLook.set(pointerNDC.x * 0.45, pointerNDC.y * 0.32);
        }
        animState.currentLook.lerp(animState.targetLook, Math.min(1.0, safeDt * 8.5));

        // Vibe intensity builds up with user cursor movement or speech
        const targetVibe = Math.min(1.0, 0.22 + cursorSpeed * 0.45 + speechLevel * 0.85 + (isListening ? 0.3 : 0.0));
        animState.vibeIntensity += (targetVibe - animState.vibeIntensity) * Math.min(1.0, safeDt * 5.0);

        // Listening attentive forward lean
        const targetLean = isListening ? 0.14 : 0.0;
        animState.listeningLean += (targetLean - animState.listeningLean) * Math.min(1.0, safeDt * 6.0);

        // Speech mouth articulation
        animState.speechOpen += (speechLevel - animState.speechOpen) * Math.min(1.0, safeDt * 22.0);
        if (animState.speechOpen > 0.04) {
          openMouthMesh.visible = true;
          const mouthW = 0.65 + animState.speechOpen * 0.75;
          const mouthH = Math.max(0.08, animState.speechOpen * 1.35);
          openMouthMesh.scale.set(mouthW, mouthH, 0.6);
          mouthArcs[0].position.y = 0.035 + animState.speechOpen * 0.015;
          mouthArcs[1].position.y = 0.035 + animState.speechOpen * 0.015;
        } else {
          openMouthMesh.visible = false;
          mouthArcs[0].position.y = 0.035;
          mouthArcs[1].position.y = 0.035;
        }

        // Boop jump & dance spin decay
        if (animState.boopImpulse > 0.001) {
          animState.boopPhase += safeDt * 14.5;
          animState.boopImpulse *= Math.exp(-safeDt * 3.4);
        } else {
          animState.boopImpulse = 0.0;
        }

        if (animState.danceSpinImpulse > 0.002) {
          animState.danceSpinAngle += safeDt * 10.5 * animState.danceSpinImpulse;
          animState.danceSpinImpulse *= Math.exp(-safeDt * 1.8);
        } else {
          animState.danceSpinImpulse = 0.0;
          animState.danceSpinAngle *= Math.exp(-safeDt * 6.0);
        }

        const vibeGroove = Math.sin(animState.time * 4.8) * 0.038 * animState.vibeIntensity;
        const breath = Math.sin(animState.time * 2.3) * 0.035 + vibeGroove;

        const swayX =
          Math.sin(animState.time * 1.6) * (0.06 + animState.vibeIntensity * 0.08) +
          animState.currentLook.x * 0.22;

        const jumpY =
          Math.sin(animState.time * 2.3) * 0.045 +
          Math.abs(Math.sin(animState.time * 4.8)) * animState.vibeIntensity * 0.055 +
          Math.abs(Math.sin(animState.boopPhase)) * animState.boopImpulse * 0.34 +
          animState.speechOpen * 0.04;

        const squash =
          1.0 +
          breath +
          Math.cos(animState.boopPhase * 2.0) * animState.boopImpulse * 0.14 +
          animState.speechOpen * 0.045;

        const prevX = root.position.x;
        const prevY = root.position.y;
        const prevZ = root.position.z;
        const prevRotY = root.rotation.y;
        const prevRotZ = root.rotation.z;

        root.position.set(swayX, jumpY, animState.listeningLean);
        root.scale.set(1.0 / Math.sqrt(squash), squash, 1.0 / Math.sqrt(squash));

        root.rotation.y =
          animState.currentLook.x * 0.46 +
          Math.sin(animState.time * 1.1) * 0.08 +
          animState.danceSpinAngle;
        root.rotation.x =
          -animState.currentLook.y * 0.28 +
          Math.cos(animState.time * 1.8) * 0.04 +
          animState.listeningLean * 0.45 -
          animState.speechOpen * 0.06;
        root.rotation.z =
          -swayX * 0.38 +
          Math.sin(animState.boopPhase) * animState.boopImpulse * 0.18 +
          Math.sin(animState.time * 4.8) * animState.vibeIntensity * 0.06;

        animState.velocity.set(
          (root.position.x - prevX) / safeDt,
          (root.position.y - prevY) / safeDt,
          (root.position.z - prevZ) / safeDt
        );
        animState.angularVelocity.set(
          0,
          (root.rotation.y - prevRotY) / safeDt,
          (root.rotation.z - prevRotZ) / safeDt
        );

        // Blinking & happy squint
        animState.blinkTimer += safeDt;
        let blinkScaleY = 1.0;
        if (animState.blinkTimer > animState.nextBlink) {
          const blinkProgress = (animState.blinkTimer - animState.nextBlink) / 0.15;
          if (blinkProgress < 1.0) {
            blinkScaleY = Math.max(0.08, Math.abs(Math.cos(blinkProgress * Math.PI)));
          } else {
            animState.blinkTimer = 0;
            animState.nextBlink = 2.2 + Math.random() * 2.6;
          }
        }
        if (animState.boopImpulse > 0.25) {
          blinkScaleY = Math.min(blinkScaleY, 0.18);
        } else if (isListening) {
          blinkScaleY = Math.max(blinkScaleY, 1.08);
        }

        for (const eye of eyes) {
          eye.pivot.scale.y = blinkScaleY;
          eye.catchlightMain.position.x = -eye.side * 0.042 + animState.currentLook.x * 0.032;
          eye.catchlightMain.position.y = 0.052 + animState.currentLook.y * 0.028;
        }
      }

      return {
        root,
        bodyMesh,
        bodyGeometry,
        skinMaterial,
        animState,
        triggerBoop,
        triggerDanceSpin,
        update
      };
    }

    // =========================================================================
    // 5. HYBRID GPU FUR SYSTEM (64 VOLUMETRIC SHELLS + 60,000 3D STRANDS)
    // =========================================================================
    const SHELL_COUNT = 64;
    const WEBGL_SHELL_COUNT = 32;
    const WEBGL_STRAND_COUNT = 26000;
    const MAX_STRAND_COUNT = 60000;

    function createHairBladeTemplateGeometry(segments = 20) {
      const positions = [];
      const indices = [];
      for (let s = 0; s <= segments; s++) {
        const h = s / segments;
        positions.push(-1.0, h, 0.0);
        positions.push(1.0, h, 0.0);
      }
      for (let s = 0; s < segments; s++) {
        const row0 = s * 2;
        const row1 = row0 + 2;
        indices.push(row0, row0 + 1, row1);
        indices.push(row0 + 1, row1 + 1, row1);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setIndex(indices);
      return geom;
    }

    function createGPUFurSystem(baseGeometry, initialParams) {
      let gpuFurEnabled = Boolean(initialParams.gpuFurEnabled);

      const sharedUniforms = {
        uPhysicsTex: { value: null },
        uFurLength: { value: initialParams.furLength },
        uFurDensity: { value: initialParams.furDensity },
        uClumping: { value: initialParams.clumping },
        uCurliness: { value: initialParams.curliness },
        uBaseColor: { value: new THREE.Color(initialParams.baseColor) },
        uTipColor: { value: new THREE.Color(initialParams.tipColor) },
        uRoughness: { value: initialParams.roughness },
        uSpecular: { value: initialParams.specular },
        uKeyLightDir: { value: new THREE.Vector3(-0.7, 0.75, 0.45).normalize() },
        uKeyLightColor: { value: new THREE.Color('#fff7ed') },
        uKeyLightIntensity: { value: 1.38 },
        uRimLightDir: { value: new THREE.Vector3(-0.6, 0.45, -0.85).normalize() },
        uRimLightColor: { value: new THREE.Color(initialParams.rimColor || '#c4b5fd') },
        uRimIntensity: { value: 1.45 },
        uAmbientIntensity: { value: 0.62 },
        uTime: { value: 0.0 },
        uWindStrength: { value: 0.95 },
        uPointerLocalPos: { value: new THREE.Vector3(0, 0, 2) },
        uPointerActive: { value: 0.0 },
        uGpuFurMode: { value: gpuFurEnabled ? 1.0 : 0.0 },
        uShellCountScale: { value: gpuFurEnabled ? 1.0 : SHELL_COUNT / WEBGL_SHELL_COUNT },
        uWebGLInertia: { value: new THREE.Vector3(0, 0, 0) },
        uBoopShockwave: { value: 0.0 },
        uVoiceGlow: { value: 0.0 }
      };

      const shellGeometry = new THREE.InstancedBufferGeometry();
      shellGeometry.index = baseGeometry.index;
      shellGeometry.attributes.position = baseGeometry.attributes.position;
      shellGeometry.attributes.normal = baseGeometry.attributes.normal;
      shellGeometry.attributes.uv = baseGeometry.attributes.uv;
      shellGeometry.attributes.aFollicleMask = baseGeometry.attributes.aFollicleMask;
      shellGeometry.attributes.aGroomTangent = baseGeometry.attributes.aGroomTangent;

      const shellIndices = new Float32Array(SHELL_COUNT);
      for (let i = 0; i < SHELL_COUNT; i++) {
        shellIndices[i] = (i + 1) / SHELL_COUNT;
      }
      shellGeometry.setAttribute('aShellIndex', new THREE.InstancedBufferAttribute(shellIndices, 1));
      shellGeometry.instanceCount = gpuFurEnabled ? SHELL_COUNT : WEBGL_SHELL_COUNT;

      const shellMaterial = new THREE.ShaderMaterial({
        vertexShader: SHELL_VERTEX_SHADER,
        fragmentShader: SHELL_FRAGMENT_SHADER,
        uniforms: sharedUniforms,
        transparent: false,
        depthWrite: true,
        side: THREE.FrontSide
      });

      const shellMesh = new THREE.Mesh(shellGeometry, shellMaterial);
      shellMesh.frustumCulled = false;
      shellMesh.renderOrder = 1;

      const templateGeo = createHairBladeTemplateGeometry(20);
      const strandGeometry = new THREE.InstancedBufferGeometry();
      strandGeometry.index = templateGeo.index;
      strandGeometry.attributes.position = templateGeo.attributes.position;

      const posAttr = baseGeometry.attributes.position;
      const normAttr = baseGeometry.attributes.normal;
      const idxAttr = baseGeometry.index;
      const triCount = idxAttr.count / 3;

      const cumulativeAreas = new Float32Array(triCount);
      const vA = new THREE.Vector3();
      const vB = new THREE.Vector3();
      const vC = new THREE.Vector3();
      const edge1 = new THREE.Vector3();
      const edge2 = new THREE.Vector3();
      const crossVec = new THREE.Vector3();

      let totalArea = 0;
      for (let t = 0; t < triCount; t++) {
        const i0 = idxAttr.getX(t * 3);
        const i1 = idxAttr.getX(t * 3 + 1);
        const i2 = idxAttr.getX(t * 3 + 2);
        vA.fromBufferAttribute(posAttr, i0);
        vB.fromBufferAttribute(posAttr, i1);
        vC.fromBufferAttribute(posAttr, i2);
        edge1.subVectors(vB, vA);
        edge2.subVectors(vC, vA);
        const area = crossVec.crossVectors(edge1, edge2).length() * 0.5;
        totalArea += area;
        cumulativeAreas[t] = totalArea;
      }

      const CLUMP_COUNT = 420;
      const clumpCenters = new Float32Array(CLUMP_COUNT * 3);
      for (let c = 0; c < CLUMP_COUNT; c++) {
        const rArea = ((c + 0.5) / CLUMP_COUNT) * totalArea;
        let lo = 0;
        let hi = triCount - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cumulativeAreas[mid] < rArea) lo = mid + 1;
          else hi = mid;
        }
        const i0 = idxAttr.getX(lo * 3);
        clumpCenters[c * 3] = posAttr.getX(i0);
        clumpCenters[c * 3 + 1] = posAttr.getY(i0);
        clumpCenters[c * 3 + 2] = posAttr.getZ(i0);
      }

      const rootPosArray = new Float32Array(MAX_STRAND_COUNT * 3);
      const rootNormalArray = new Float32Array(MAX_STRAND_COUNT * 3);
      const groomDirArray = new Float32Array(MAX_STRAND_COUNT * 3);
      const clumpOffsetArray = new Float32Array(MAX_STRAND_COUNT * 3);
      const strandSeedArray = new Float32Array(MAX_STRAND_COUNT);
      const maskValueArray = new Float32Array(MAX_STRAND_COUNT);

      let validCount = 0;
      let prngState = 133742;
      const nextRand = () => {
        prngState = (prngState * 1664525 + 1013904223) >>> 0;
        return prngState / 4294967296;
      };

      while (validCount < MAX_STRAND_COUNT) {
        const targetArea = nextRand() * totalArea;
        let lo = 0;
        let hi = triCount - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cumulativeAreas[mid] < targetArea) lo = mid + 1;
          else hi = mid;
        }

        const i0 = idxAttr.getX(lo * 3);
        const i1 = idxAttr.getX(lo * 3 + 1);
        const i2 = idxAttr.getX(lo * 3 + 2);

        const r1 = Math.sqrt(nextRand());
        const r2 = nextRand();
        const w0 = 1.0 - r1;
        const w1 = r1 * (1.0 - r2);
        const w2 = r1 * r2;

        const px = posAttr.getX(i0) * w0 + posAttr.getX(i1) * w1 + posAttr.getX(i2) * w2;
        const py = posAttr.getY(i0) * w0 + posAttr.getY(i1) * w1 + posAttr.getY(i2) * w2;
        const pz = posAttr.getZ(i0) * w0 + posAttr.getZ(i1) * w1 + posAttr.getZ(i2) * w2;

        const mask = evaluateFollicleMask(px, py, pz);
        if (mask < 0.04) continue;

        let nx = normAttr.getX(i0) * w0 + normAttr.getX(i1) * w1 + normAttr.getX(i2) * w2;
        let ny = normAttr.getY(i0) * w0 + normAttr.getY(i1) * w1 + normAttr.getY(i2) * w2;
        let nz = normAttr.getZ(i0) * w0 + normAttr.getZ(i1) * w1 + normAttr.getZ(i2) * w2;
        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;

        const [gx, gy, gz] = evaluateGroomFlow(px, py, pz, nx, ny, nz);

        let nearestIdx = 0;
        let minDistSq = Infinity;
        const startC = Math.floor(((py + 1.1) / 2.2) * (CLUMP_COUNT - 40));
        const searchStart = Math.max(0, Math.min(CLUMP_COUNT - 40, startC));
        for (let c = searchStart; c < searchStart + 40; c++) {
          const dx = clumpCenters[c * 3] - px;
          const dy = clumpCenters[c * 3 + 1] - py;
          const dz = clumpCenters[c * 3 + 2] - pz;
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            nearestIdx = c;
          }
        }

        let cx = clumpCenters[nearestIdx * 3] - px;
        let cy = clumpCenters[nearestIdx * 3 + 1] - py;
        let cz = clumpCenters[nearestIdx * 3 + 2] - pz;
        const dotCN = cx * nx + cy * ny + cz * nz;
        cx -= dotCN * nx;
        cy -= dotCN * ny;
        cz -= dotCN * nz;

        const idx3 = validCount * 3;
        rootPosArray[idx3] = px;
        rootPosArray[idx3 + 1] = py;
        rootPosArray[idx3 + 2] = pz;

        rootNormalArray[idx3] = nx;
        rootNormalArray[idx3 + 1] = ny;
        rootNormalArray[idx3 + 2] = nz;

        groomDirArray[idx3] = gx;
        groomDirArray[idx3 + 1] = gy;
        groomDirArray[idx3 + 2] = gz;

        clumpOffsetArray[idx3] = cx;
        clumpOffsetArray[idx3 + 1] = cy;
        clumpOffsetArray[idx3 + 2] = cz;

        strandSeedArray[validCount] = validCount / MAX_STRAND_COUNT;
        maskValueArray[validCount] = mask;

        validCount++;
      }

      strandGeometry.setAttribute('aRootPos', new THREE.InstancedBufferAttribute(rootPosArray, 3));
      strandGeometry.setAttribute('aRootNormal', new THREE.InstancedBufferAttribute(rootNormalArray, 3));
      strandGeometry.setAttribute('aGroomDir', new THREE.InstancedBufferAttribute(groomDirArray, 3));
      strandGeometry.setAttribute('aClumpOffset', new THREE.InstancedBufferAttribute(clumpOffsetArray, 3));
      strandGeometry.setAttribute('aStrandSeed', new THREE.InstancedBufferAttribute(strandSeedArray, 1));
      strandGeometry.setAttribute('aMaskValue', new THREE.InstancedBufferAttribute(maskValueArray, 1));

      const activeMaxStrands = gpuFurEnabled ? MAX_STRAND_COUNT : WEBGL_STRAND_COUNT;
      strandGeometry.instanceCount = Math.floor(activeMaxStrands * initialParams.furDensity);

      const strandMaterial = new THREE.ShaderMaterial({
        vertexShader: STRAND_VERTEX_SHADER,
        fragmentShader: STRAND_FRAGMENT_SHADER,
        uniforms: sharedUniforms,
        transparent: false,
        depthWrite: true,
        side: THREE.DoubleSide
      });

      const strandMesh = new THREE.Mesh(strandGeometry, strandMaterial);
      strandMesh.frustumCulled = false;
      strandMesh.renderOrder = 2;

      function applyPreset(preset, skinMaterial) {
        sharedUniforms.uBaseColor.value.set(preset.baseColor);
        sharedUniforms.uTipColor.value.set(preset.tipColor);
        sharedUniforms.uRimLightColor.value.set(preset.rimColor || '#c4b5fd');
        sharedUniforms.uFurLength.value = preset.furLength;
        sharedUniforms.uFurDensity.value = preset.furDensity;
        sharedUniforms.uRoughness.value = preset.roughness;
        sharedUniforms.uSpecular.value = preset.specular;
        sharedUniforms.uClumping.value = preset.clumping;
        sharedUniforms.uCurliness.value = preset.curliness;
        const cap = gpuFurEnabled ? MAX_STRAND_COUNT : WEBGL_STRAND_COUNT;
        strandGeometry.instanceCount = Math.floor(cap * preset.furDensity);
        if (skinMaterial) {
          skinMaterial.color.set(preset.baseColor).multiplyScalar(0.55);
        }
      }

      function updateDensity(density) {
        const d = Math.max(0.05, Math.min(1.0, Number(density) || 0.82));
        const cap = gpuFurEnabled ? MAX_STRAND_COUNT : WEBGL_STRAND_COUNT;
        strandGeometry.instanceCount = Math.floor(cap * d);
      }

      function setGPUFurEnabled(enabled) {
        gpuFurEnabled = Boolean(enabled);
        sharedUniforms.uGpuFurMode.value = gpuFurEnabled ? 1.0 : 0.0;
        sharedUniforms.uShellCountScale.value = gpuFurEnabled ? 1.0 : SHELL_COUNT / WEBGL_SHELL_COUNT;
        shellGeometry.instanceCount = gpuFurEnabled ? SHELL_COUNT : WEBGL_SHELL_COUNT;
        updateDensity(sharedUniforms.uFurDensity.value);
      }

      return {
        shellMesh,
        strandMesh,
        sharedUniforms,
        applyPreset,
        updateDensity,
        setGPUFurEnabled,
        isGPUFurEnabled: () => gpuFurEnabled
      };
    }
    // =========================================================================
    // 6. SCENE INITIALIZATION — sized to the ARGON FRAME, not the browser
    // =========================================================================
    const container = document.getElementById('canvas-container');

    const COAT_PRESETS = [
      { id: 'nebula',    name: 'Argon Nebula', baseColor: '#5e2bff', tipColor: '#ff9ec7', rimColor: '#c4b5fd', furLength: 0.32, furDensity: 0.82, roughness: 0.74, specular: 0.28, clumping: 0.36, curliness: 0.25 },
      { id: 'cyber',     name: 'Cyber Cyan',   baseColor: '#0f172a', tipColor: '#38bdf8', rimColor: '#67e8f9', furLength: 0.31, furDensity: 0.90, roughness: 0.68, specular: 0.32, clumping: 0.42, curliness: 0.18 },
      { id: 'solar',     name: 'Solar Gold',   baseColor: '#7c2d12', tipColor: '#fde047', rimColor: '#fed7aa', furLength: 0.36, furDensity: 0.88, roughness: 0.75, specular: 0.26, clumping: 0.58, curliness: 0.52 },
      { id: 'emerald',   name: 'Emerald Pulse',baseColor: '#064e3b', tipColor: '#6ee7b7', rimColor: '#a7f3d0', furLength: 0.35, furDensity: 0.86, roughness: 0.74, specular: 0.25, clumping: 0.55, curliness: 0.62 },
      { id: 'midnight',  name: 'Midnight Velvet', baseColor: '#131638', tipColor: '#67e8f9', rimColor: '#a5b4fc', furLength: 0.29, furDensity: 0.95, roughness: 0.77, specular: 0.24, clumping: 0.44, curliness: 0.15 },
      { id: 'starlight', name: 'Starlight Snow', baseColor: '#334155', tipColor: '#f8fafc', rimColor: '#e0e7ff', furLength: 0.34, furDensity: 0.92, roughness: 0.70, specular: 0.30, clumping: 0.40, curliness: 0.28 }
    ];

    const BACKDROPS = {
      void:    { bg: '#000000', key: '#fff7ed', rim: '#c4b5fd', hemiSky: '#f5d0fe', hemiGround: '#090514', css: 'radial-gradient(circle at 50% 42%, rgba(88,28,135,0.30) 0%, rgba(5,4,11,0) 62%), #05040b' },
      nebula:  { bg: '#070312', key: '#ffe4f0', rim: '#7c3aed', hemiSky: '#f0abfc', hemiGround: '#120726', css: 'radial-gradient(circle at 22% 28%, rgba(168,85,247,0.55) 0%, rgba(5,4,11,0) 55%), radial-gradient(circle at 78% 72%, rgba(56,189,248,0.32) 0%, rgba(5,4,11,0) 58%), #070312' },
      sunrise: { bg: '#160a12', key: '#ffd9b0', rim: '#fb923c', hemiSky: '#fed7aa', hemiGround: '#2b0f16', css: 'radial-gradient(circle at 50% 92%, rgba(251,146,60,0.55) 0%, rgba(22,10,18,0) 60%), linear-gradient(180deg, #160a12 0%, #2a1018 100%)' },
      ocean:   { bg: '#04121c', key: '#bfefff', rim: '#0ea5e9', hemiSky: '#7dd3fc', hemiGround: '#022033', css: 'radial-gradient(circle at 50% 30%, rgba(14,165,233,0.42) 0%, rgba(4,18,28,0) 62%), linear-gradient(180deg, #04121c, #010a12)' },
      ember:   { bg: '#150804', key: '#ffcf9a', rim: '#f97316', hemiSky: '#fdba74', hemiGround: '#1f0a03', css: 'radial-gradient(circle at 50% 88%, rgba(249,115,22,0.48) 0%, rgba(21,8,4,0) 62%), #150804' }
    };

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
    } catch (e) {
      const boot = document.getElementById('boot-error');
      if (boot) boot.classList.add('show');
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    /** Detect a software rasteriser so Argon can drop to a light coat. */
    function detectSoftwareGPU() {
      try {
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
        return /swiftshader|llvmpipe|software|basic render|mesa offscreen/i.test(name);
      } catch (e) { return false; }
    }
    const forceLite = new URLSearchParams(window.location.search).get('lite') === '1';
    const softwareGPU = detectSoftwareGPU();
    const liteMode = forceLite || softwareGPU;
    if (liteMode) renderer.setPixelRatio(1);

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);

    const camSpherical = {
      radius: 5.8, targetRadius: 5.8,
      theta: 0.0, targetTheta: 0.0,
      phi: Math.PI * 0.47, targetPhi: Math.PI * 0.47
    };

    let viewW = 1, viewH = 1;

    function updateCameraFraming() {
      const aspect = viewW / Math.max(1, viewH);
      // The visible scene size depends on FOV and distance, not on pixel size,
      // so a small window simply shows the same Argon, smaller. Only extreme
      // portrait aspects need the camera to pull back.
      const zoomOut = aspect < 0.85 ? Math.min(1.75, 0.8 / Math.max(0.5, aspect)) : 1.0;
      camSpherical.targetRadius = 6.25 * zoomOut;
      if (!userZoomed) camSpherical.radius = camSpherical.targetRadius;
    }
    let userZoomed = false;

    const keyLight = new THREE.DirectionalLight('#fff7ed', 1.85);
    keyLight.position.set(-2.6, 2.2, 2.4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#c4b5fd', 1.65);
    rimLight.position.set(-2.4, 1.8, -3.2);
    scene.add(rimLight);

    const hemiLight = new THREE.HemisphereLight('#f5d0fe', '#090514', 0.85);
    scene.add(hemiLight);

    const creature = createArgonCreature();
    scene.add(creature.root);

    const gpuPhysics = createGPUFurPhysics(renderer);
    const gpuSupported = gpuPhysics.isGPGPUActive;
    let gpuFurOn = gpuSupported && state.gpuFur !== false && !liteMode;

    const initialPreset = {
      ...(COAT_PRESETS.find((c) => c.id === state.coat) || COAT_PRESETS[0]),
      gpuFurEnabled: gpuFurOn
    };
    const furSystem = createGPUFurSystem(creature.bodyGeometry, initialPreset);
    creature.root.add(furSystem.shellMesh);
    creature.root.add(furSystem.strandMesh);
    furSystem.applyPreset(initialPreset, creature.skinMaterial);

    let backdropId = 'void';

    function setBackdrop(id) {
      const b = BACKDROPS[id] || BACKDROPS.void;
      backdropId = BACKDROPS[id] ? id : 'void';
      const vp = document.getElementById('argon-viewport');
      if (vp) vp.style.background = b.css;
      keyLight.color.set(b.key);
      rimLight.color.set(b.rim);
      hemiLight.color.set(b.hemiSky);
      hemiLight.groundColor.set(b.hemiGround);
      furSystem.sharedUniforms.uKeyLightColor.value.set(b.key);
      furSystem.sharedUniforms.uRimLightColor.value.set(b.rim);
      bus.emit('backdrop:changed', backdropId);
    }
    setBackdrop('void');

    /* ---- Audio chirp (shares the music engine's AudioContext) -------------- */

    function ensureAudioContext() {
      if (typeof Music !== 'undefined' && Music.ensure) return Music.ctx;
      return null;
    }

    function playArgonChirp(kind) {
      if (!state.tts) return;
      const ctx = ensureAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (kind === 'boop') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.11);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.22);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.11, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        osc.start(now); osc.stop(now + 0.25);
      } else if (kind === 'listen') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(690, now + 0.12);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        osc.start(now); osc.stop(now + 0.15);
      } else {
        osc.type = 'sine';
        const base = 310 + Math.random() * 170;
        osc.frequency.setValueAtTime(base, now);
        osc.frequency.exponentialRampToValueAtTime(base * 1.18, now + 0.065);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.035, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.start(now); osc.stop(now + 0.085);
      }
    }

    /* =========================================================================
       7. POINTER INTERACTION — NDC is resolved against the canvas rect so the
          creature reacts correctly at any window size.
       ========================================================================= */
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2(0, 0);
    const prevPointerNDC = new THREE.Vector2(0, 0);
    const pointerLocalPos = new THREE.Vector3(0, 0, 2);
    const prevPointerLocalPos = new THREE.Vector3(0, 0, 2);
    const pointerVelocity = new THREE.Vector3(0, 0, 0);
    let cursorScreenSpeed = 0.0;
    let isPointerOverCreature = false;
    let isOrbitDragging = false;
    let pointerDownPos = { x: 0, y: 0 };
    let prevPointerClient = { x: 0, y: 0 };
    let boopShockwave = 0.0;
    let petSweep = null;

    function canvasRect() {
      return renderer.domElement.getBoundingClientRect();
    }

    function isOnUI(target) {
      return !!(target && typeof target.closest === 'function' &&
        (target.closest('#deck') || target.closest('#argon-chrome') || target.closest('#argon-bubble')));
    }

    window.addEventListener('pointermove', (e) => {
      const rect = canvasRect();
      if (!rect.width || !rect.height) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
      const ny = -((e.clientY - rect.top) / rect.height) * 2.0 + 1.0;

      const dxNDC = nx - pointerNDC.x;
      const dyNDC = ny - pointerNDC.y;
      cursorScreenSpeed = Math.min(2.5, Math.hypot(dxNDC, dyNDC) * 18.0);

      prevPointerNDC.copy(pointerNDC);
      pointerNDC.set(nx, ny);

      if (isOrbitDragging) {
        const dxPx = e.clientX - prevPointerClient.x;
        const dyPx = e.clientY - prevPointerClient.y;
        prevPointerClient.x = e.clientX;
        prevPointerClient.y = e.clientY;
        camSpherical.targetTheta -= dxPx * 0.0065;
        camSpherical.targetPhi = Math.max(0.65, Math.min(Math.PI * 0.64, camSpherical.targetPhi - dyPx * 0.0055));
        return;
      }

      if (isOnUI(e.target)) {
        isPointerOverCreature = false;
        return;
      }

      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObject(creature.bodyMesh, false);
      if (hits.length > 0) {
        prevPointerLocalPos.copy(pointerLocalPos);
        pointerLocalPos.copy(hits[0].point);
        creature.root.worldToLocal(pointerLocalPos);
        if (isPointerOverCreature) {
          pointerVelocity.subVectors(pointerLocalPos, prevPointerLocalPos).multiplyScalar(32.0);
        }
        isPointerOverCreature = true;
        container.style.cursor = 'pointer';
      } else {
        isPointerOverCreature = false;
        pointerLocalPos.set(nx * 1.15, ny * 1.15, 0.9);
        pointerVelocity.set(dxNDC * 18.0, dyNDC * 18.0, 0.0);
        container.style.cursor = 'grab';
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (isOnUI(e.target)) return;
      ensureAudioContext();
      pointerDownPos.x = e.clientX;
      pointerDownPos.y = e.clientY;
      prevPointerClient.x = e.clientX;
      prevPointerClient.y = e.clientY;
      if (!isPointerOverCreature) isOrbitDragging = true;
    });

    window.addEventListener('pointerup', (e) => {
      isOrbitDragging = false;
      if (isOnUI(e.target)) return;
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moveDist < 7 && isPointerOverCreature) {
        triggerBoop();
      }
    });

    window.addEventListener('wheel', (e) => {
      if (isOnUI(e.target)) return;
      userZoomed = true;
      camSpherical.targetRadius = Math.max(2.6, Math.min(12.0, camSpherical.targetRadius + e.deltaY * 0.003));
    }, { passive: true });

    /* ---- Resize observer: the renderer follows the ARGON FRAME -------------- */
    function resizeRenderer() {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      viewW = w; viewH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      updateCameraFraming();
    }
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(resizeRenderer).observe(container);
    }
    window.addEventListener('resize', resizeRenderer);
    resizeRenderer();

    /* =========================================================================
       8. PUBLIC SCENE API — every fur / vibe control is a real callable
       ========================================================================= */

    function applyCoat(coatId) {
      const preset = COAT_PRESETS.find((c) => c.id === coatId) || COAT_PRESETS[0];
      state.coat = preset.id;
      furSystem.applyPreset(preset, creature.skinMaterial);
      rimLight.color.set(preset.rimColor || '#c4b5fd');
      furSystem.sharedUniforms.uRimLightColor.value.set(preset.rimColor || '#c4b5fd');
      saveState();
      bus.emit('coat:changed', preset.id);
      return preset;
    }

    function setFurColor(hex) {
      const c = new THREE.Color(hex);
      furSystem.sharedUniforms.uBaseColor.value.copy(c).multiplyScalar(0.9);
      furSystem.sharedUniforms.uTipColor.value.copy(c).offsetHSL(0.08, 0.15, 0.28);
      creature.skinMaterial.color.copy(c).multiplyScalar(0.55);
      bus.emit('fur:color', hex);
      return hex;
    }

    function setFurParam(key, value) {
      const u = furSystem.sharedUniforms;
      if (key === 'furLength') u.uFurLength.value = value;
      else if (key === 'furDensity') { u.uFurDensity.value = value; furSystem.updateDensity(value); }
      else if (key === 'curliness') u.uCurliness.value = value;
      else if (key === 'clumping') u.uClumping.value = value;
      else if (key === 'roughness') u.uRoughness.value = value;
      else if (key === 'specular') u.uSpecular.value = value;
      state[key] = value;
      saveState();
      bus.emit('fur:param', { key, value });
      return value;
    }

    function setVibe(level) {
      state.vibe = clamp(Number(level) || 0, 0, 100);
      saveState();
      bus.emit('vibe:changed', state.vibe);
      return state.vibe;
    }

    function triggerBoop() {
      creature.triggerBoop();
      boopShockwave = 1.0;
      playArgonChirp('boop');
      haptic(18);
      bus.emit('scene:boop');
    }

    function triggerDance() {
      creature.triggerDanceSpin();
      boopShockwave = 0.8;
      playArgonChirp('boop');
      haptic([12, 40, 12]);
      bus.emit('scene:dance');
    }

    /** A virtual hand that strokes the fur from left to right. */
    function triggerPetSweep() {
      if (petSweep) return;
      petSweep = { t: 0, dur: 1.35 };
      playArgonChirp('listen');
      haptic(10);
    }

    function setGpuFur(on) {
      if (!gpuSupported && on) return false;
      gpuFurOn = Boolean(on);
      state.gpuFur = gpuFurOn;
      furSystem.setGPUFurEnabled(gpuFurOn);
      saveState();
      bus.emit('gpufur:changed', gpuFurOn);
      return gpuFurOn;
    }

    function resetCamera() {
      userZoomed = false;
      camSpherical.targetTheta = 0;
      camSpherical.targetPhi = Math.PI * 0.47;
      updateCameraFraming();
    }

    /* =========================================================================
       9. RENDER LOOP
       ========================================================================= */
    const clock = new THREE.Clock();
    let elapsedTime = 0.0;
    let paused = false;
    let fps = 0;
    let fpsFrames = 0;
    let fpsStamp = performance.now();
    const webglInertiaDisp = new THREE.Vector3(0, 0, 0);
    const webglInertiaVel = new THREE.Vector3(0, 0, 0);
    const webglForceTmp = new THREE.Vector3(0, 0, 0);

    function animate() {
      requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.033);
      if (paused) return;
      elapsedTime += dt;

      fpsFrames++;
      const nowMs = performance.now();
      if (nowMs - fpsStamp >= 500) {
        fps = Math.round((fpsFrames * 1000) / (nowMs - fpsStamp));
        fpsFrames = 0;
        fpsStamp = nowMs;
        bus.emit('fps', fps);
      }

      // Vibe + beat energy feed straight into the fur and the body motion.
      const vibeNorm = state.vibe / 100;
      signals.beatEnergy *= Math.exp(-dt * 4.2);

      camSpherical.radius += (camSpherical.targetRadius - camSpherical.radius) * Math.min(1, dt * 6);
      camSpherical.theta += (camSpherical.targetTheta - camSpherical.theta) * Math.min(1, dt * 8);
      camSpherical.phi += (camSpherical.targetPhi - camSpherical.phi) * Math.min(1, dt * 8);

      const sinT = Math.sin(camSpherical.phi);
      camera.position.set(
        camSpherical.radius * sinT * Math.sin(camSpherical.theta),
        camSpherical.radius * Math.cos(camSpherical.phi) + 0.12,
        camSpherical.radius * sinT * Math.cos(camSpherical.theta)
      );
      camera.lookAt(0, 0.20, 0);

      // Virtual pet sweep
      if (petSweep) {
        petSweep.t += dt;
        const p = petSweep.t / petSweep.dur;
        if (p >= 1) {
          petSweep = null;
        } else {
          const x = Math.sin(p * Math.PI) * 1.25 - 0.1;
          const y = Math.cos(p * Math.PI * 2) * 0.55;
          pointerLocalPos.set(x, y, 0.95);
          pointerVelocity.set(Math.cos(p * Math.PI) * 9, Math.sin(p * Math.PI * 2) * 4, 0);
          isPointerOverCreature = true;
        }
      }

      const dynamicWind = 0.45 + vibeNorm * 1.05 + cursorScreenSpeed * 0.62 + signals.speechEnergy * 0.75 + signals.beatEnergy * 0.55;

      boopShockwave *= Math.exp(-dt * 2.8);
      if (boopShockwave < 0.001) boopShockwave = 0;
      pointerVelocity.multiplyScalar(Math.exp(-dt * 12.0));

      creature.update(
        dt,
        pointerNDC,
        cursorScreenSpeed + vibeNorm * 0.62 + signals.beatEnergy * 0.35,
        signals.speechEnergy,
        signals.listening
      );

      let physicsTexture = gpuPhysics.fallbackTexture;
      if (gpuFurOn && gpuPhysics.isGPGPUActive) {
        physicsTexture = gpuPhysics.step({
          time: elapsedTime,
          dt,
          windStrength: dynamicWind,
          creatureVelocity: creature.animState.velocity,
          creatureAngularVel: creature.animState.angularVelocity,
          pointerLocalPos,
          pointerVelocity,
          pointerActive: isPointerOverCreature,
          boopShockwave
        });
      } else {
        webglForceTmp.set(0, -0.32, 0);
        webglForceTmp.addScaledVector(creature.animState.velocity, -1.65);
        if (isPointerOverCreature) webglForceTmp.addScaledVector(pointerVelocity, 0.85);
        webglForceTmp.addScaledVector(webglInertiaDisp, -24.0);
        webglInertiaVel.addScaledVector(webglForceTmp, dt);
        webglInertiaVel.multiplyScalar(Math.exp(-5.5 * dt));
        webglInertiaDisp.addScaledVector(webglInertiaVel, dt);
        if (webglInertiaDisp.lengthSq() > 0.64) {
          webglInertiaDisp.normalize().multiplyScalar(0.8);
        }
      }

      const u = furSystem.sharedUniforms;
      u.uPhysicsTex.value = physicsTexture;
      u.uTime.value = elapsedTime;
      u.uWindStrength.value = dynamicWind;
      u.uPointerLocalPos.value.copy(pointerLocalPos);
      u.uPointerActive.value = isPointerOverCreature ? 1.0 : 0.0;
      u.uWebGLInertia.value.copy(webglInertiaDisp);
      u.uBoopShockwave.value = boopShockwave;
      u.uVoiceGlow.value = Math.min(1, signals.speechEnergy + signals.beatEnergy * 0.45);

      renderer.render(scene, camera);
    }

    animate();

    /** Pause the render loop (used by automated visual checks). */
    function pause3d() { paused = true; }
    function resume3d() { paused = false; clock.getDelta(); }
