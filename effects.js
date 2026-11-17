const canvas = document.querySelector("#ambient-canvas");
const cursorCanvas = document.querySelector("#cursor-canvas");
const soundToggle = document.querySelector(".sound-toggle");
const cursorTracker = document.querySelector(".cursor-tracker");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const clickAudio = new Audio("./audio/button-ui-app.wav");
clickAudio.preload = "auto";
clickAudio.playbackRate = 0.85;

let soundEnabled = true;
let audioContext;
let audioOutput;
let clickAudioSource;
let reverb;
let reverbOutput;
let audioUnavailable = false;

clickAudio.addEventListener("error", reportAudioFailure, { once: true });

function updateSoundControl(message) {
    if (!soundToggle) return;

    const label = message || (soundEnabled ? "Efek suara aktif, matikan" : "Efek suara mati, nyalakan");
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    soundToggle.setAttribute("aria-label", label);
    soundToggle.title = label;
    soundToggle.querySelector("span").textContent = soundEnabled ? "♫" : "♪";
}

function getAudioContext() {
    if (!soundEnabled || audioUnavailable) return null;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        audioUnavailable = true;
        soundEnabled = false;
        updateSoundControl("Efek suara tidak didukung browser ini");
        return null;
    }

    if (!audioContext) {
        try {
            audioContext = new AudioContextClass();
            audioOutput = audioContext.createGain();
            audioOutput.gain.value = 0.68;
            audioOutput.connect(audioContext.destination);

            const reverbLength = Math.floor(audioContext.sampleRate * 3);
            const impulse = audioContext.createBuffer(2, reverbLength, audioContext.sampleRate);
            for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
                const samples = impulse.getChannelData(channel);
                for (let index = 0; index < reverbLength; index += 1) {
                    const fade = Math.pow(1 - index / reverbLength, 2.2);
                    samples[index] = (Math.random() * 2 - 1) * fade;
                }
            }

            reverb = audioContext.createConvolver();
            reverb.buffer = impulse;
            reverbOutput = audioContext.createGain();
            reverbOutput.gain.value = 0.28;
            reverb.connect(reverbOutput);
            reverbOutput.connect(audioContext.destination);

            clickAudioSource = audioContext.createMediaElementSource(clickAudio);
            clickAudioSource.connect(audioOutput);
            clickAudioSource.connect(reverb);
        } catch {
            reportAudioFailure();
            return null;
        }
    }
    return audioContext;
}

function reportAudioFailure() {
    audioUnavailable = true;
    soundEnabled = false;
    updateSoundControl("Efek suara tidak tersedia di browser ini");
}

function playAmbientClick(context) {
    if (!soundEnabled || context.state !== "running") return;

    clickAudio.pause();
    clickAudio.currentTime = 0;
    const playback = clickAudio.play();
    if (playback) playback.catch(reportAudioFailure);
}

function playSound() {
    const context = getAudioContext();
    if (!context) return;

    if (context.state === "running") {
        playAmbientClick(context);
        return;
    }

    context.resume().then(
        () => playAmbientClick(context),
        reportAudioFailure
    );
}

if (soundToggle) {
    soundToggle.addEventListener("click", () => {
        soundEnabled = !soundEnabled;
        updateSoundControl();
        if (soundEnabled) playSound();
    });
}

document.addEventListener("pointerdown", () => {
    playSound();
});

document.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    const target = event.target instanceof Element ? event.target.closest(".sound-toggle") : null;
    if (!target) playSound();
});

if (canvas) {
    const context = canvas.getContext("2d");
    const cursorContext = cursorCanvas ? cursorCanvas.getContext("2d") : null;
    if (context) {
        const ripples = [];
        const particles = [];
        const interactionParticles = [];
        const cursorTrail = [];
        const ambientColors = ["71, 255, 226", "182, 255, 59", "177, 114, 255"];
        let width = 0;
        let height = 0;
        let pixelRatio = 1;
        let animationFrame = 0;
        let previousFrameTime = 0;
        let cursorAngle = -32;
        let scrollTarget = 0;
        let scrollVelocity = 0;
        let lastScrollY = window.scrollY;
        let lastScrollTime = performance.now();
        const pointer = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };
        const previousPointer = { x: -1000, y: -1000 };
        const previousSmoothPointer = { x: -1000, y: -1000 };

        function seedParticles() {
            particles.length = 0;
            const count = Math.min(150, Math.max(72, Math.round((width * height) / 12500)));
            for (let index = 0; index < count; index += 1) {
                const x = Math.random() * width;
                const y = Math.random() * height;
                particles.push({
                    x,
                    y,
                    previousX: x,
                    previousY: y,
                    drift: (Math.random() - 0.5) * 0.28,
                    baseSpeed: 0.22 + Math.random() * 0.55,
                    size: 1.2 + Math.random() * 2,
                    phase: Math.random() * Math.PI * 2,
                    color: ambientColors[index % ambientColors.length]
                });
            }
        }

        function resizeCanvas() {
            pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = Math.round(width * pixelRatio);
            canvas.height = Math.round(height * pixelRatio);
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            if (cursorContext && cursorCanvas) {
                cursorCanvas.width = Math.round(width * pixelRatio);
                cursorCanvas.height = Math.round(height * pixelRatio);
                cursorContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            }
            seedParticles();
            render(performance.now());
        }

        function addRipple(x, y) {
            if (motionPreference.matches) return;
            ripples.push({
                x,
                y,
                age: 0,
                radius: Math.max(150, Math.min(260, Math.max(width, height) * 0.25))
            });
            if (ripples.length > 8) ripples.shift();

            for (let index = 0; index < 12; index += 1) {
                const angle = (Math.PI * 2 * index) / 12 + Math.random() * 0.2;
                const speed = 0.22 + Math.random() * 0.42;
                interactionParticles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    age: 0,
                    life: 46 + Math.random() * 20,
                    size: 1.2 + Math.random() * 1.6,
                    color: ambientColors[index % ambientColors.length]
                });
            }
            if (interactionParticles.length > 120) {
                interactionParticles.splice(0, interactionParticles.length - 120);
            }
        }

        function drawAmbientGlow(time) {
            const seconds = time * 0.00016;
            const size = Math.max(width, height);
            ambientColors.forEach((color, index) => {
                const x = width * (0.18 + index * 0.34 + Math.sin(seconds + index * 2.2) * 0.1);
                const y = height * (0.28 + Math.cos(seconds * 0.8 + index * 1.7) * 0.22);
                const radius = Math.max(130, size * (0.2 + index * 0.025));
                const glow = context.createRadialGradient(x, y, 0, x, y, radius);
                glow.addColorStop(0, `rgba(${color}, 0.12)`);
                glow.addColorStop(1, `rgba(${color}, 0)`);
                context.fillStyle = glow;
                context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            });
        }

        function drawParticles(frameScale) {
            for (const particle of particles) {
                particle.previousX = particle.x;
                particle.previousY = particle.y;
                particle.phase += 0.012 * frameScale;
                particle.x += (particle.drift + Math.sin(particle.phase) * 0.12) * frameScale;
                particle.y += (-particle.baseSpeed - scrollVelocity * 0.5) * frameScale;
                if (particle.y < -8) {
                    particle.y = height + 8;
                    particle.x = Math.random() * width;
                    particle.previousX = particle.x;
                    particle.previousY = particle.y;
                } else if (particle.y > height + 8) {
                    particle.y = -8;
                    particle.x = Math.random() * width;
                    particle.previousX = particle.x;
                    particle.previousY = particle.y;
                }
                if (particle.x < -8) {
                    particle.x = width + 8;
                    particle.previousX = particle.x;
                }
                if (particle.x > width + 8) {
                    particle.x = -8;
                    particle.previousX = particle.x;
                }

                const brightness = 0.62 + (Math.sin(particle.phase * 2) + 1) * 0.19;
                context.globalAlpha = brightness;
                const travel = Math.hypot(
                    particle.x - particle.previousX,
                    particle.y - particle.previousY
                );
                if (travel > 1.5) {
                    context.beginPath();
                    context.moveTo(particle.previousX, particle.previousY);
                    context.lineTo(particle.x, particle.y);
                    context.strokeStyle = `rgba(${particle.color}, 0.68)`;
                    context.lineWidth = Math.min(2.4, particle.size);
                    context.stroke();
                }
                context.beginPath();
                context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                context.fillStyle = `rgba(${particle.color}, 0.95)`;
                context.shadowColor = `rgba(${particle.color}, 0.72)`;
                context.shadowBlur = particle.size * 7;
                context.fill();
                context.shadowBlur = 0;
            }
            for (let index = interactionParticles.length - 1; index >= 0; index -= 1) {
                const particle = interactionParticles[index];
                particle.age += frameScale;
                particle.x += particle.vx * frameScale;
                particle.y += particle.vy * frameScale;
                context.globalAlpha = Math.max(0, 1 - particle.age / particle.life);
                context.beginPath();
                context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                context.fillStyle = `rgba(${particle.color}, 0.95)`;
                context.fill();
                if (particle.age >= particle.life) interactionParticles.splice(index, 1);
            }
            context.globalAlpha = 1;
        }

        function drawCursor(frameScale) {
            if (!cursorContext || pointer.targetX < 0) return;

            const lastPoint = cursorTrail[cursorTrail.length - 1];
            if (!lastPoint || Math.hypot(pointer.x - lastPoint.x, pointer.y - lastPoint.y) > 0.7) {
                cursorTrail.push({ x: pointer.x, y: pointer.y, age: 0 });
            }

            for (const point of cursorTrail) point.age += frameScale;
            while (cursorTrail.length > 36 || (cursorTrail[0] && cursorTrail[0].age > 42)) {
                cursorTrail.shift();
            }

            if (cursorTrail.length > 1) {
                const first = cursorTrail[0];
                const last = cursorTrail[cursorTrail.length - 1];
                const gradient = cursorContext.createLinearGradient(first.x, first.y, last.x, last.y);
                gradient.addColorStop(0, "rgba(71, 255, 226, 0)");
                gradient.addColorStop(0.55, "rgba(71, 255, 226, 0.34)");
                gradient.addColorStop(1, "rgba(204, 255, 249, 0.92)");

                cursorContext.beginPath();
                cursorContext.moveTo(first.x, first.y);
                for (let index = 1; index < cursorTrail.length - 1; index += 1) {
                    const point = cursorTrail[index];
                    const next = cursorTrail[index + 1];
                    cursorContext.quadraticCurveTo(
                        point.x,
                        point.y,
                        (point.x + next.x) / 2,
                        (point.y + next.y) / 2
                    );
                }
                cursorContext.lineTo(last.x, last.y);
                cursorContext.lineCap = "round";
                cursorContext.lineJoin = "round";
                cursorContext.strokeStyle = gradient;
                cursorContext.shadowColor = "rgba(71, 255, 226, 0.62)";
                cursorContext.shadowBlur = 18;
                cursorContext.lineWidth = 7;
                cursorContext.globalAlpha = 0.46;
                cursorContext.stroke();
                cursorContext.shadowBlur = 7;
                cursorContext.lineWidth = 2.3;
                cursorContext.globalAlpha = 0.82;
                cursorContext.stroke();
                cursorContext.shadowBlur = 0;
                cursorContext.globalAlpha = 1;
            }

            const glow = cursorContext.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 34);
            glow.addColorStop(0, "rgba(226, 255, 252, 0.68)");
            glow.addColorStop(0.25, "rgba(71, 255, 226, 0.35)");
            glow.addColorStop(1, "rgba(71, 255, 226, 0)");
            cursorContext.fillStyle = glow;
            cursorContext.fillRect(pointer.x - 34, pointer.y - 34, 68, 68);
        }

        function drawRipples(frameScale) {
            for (let index = ripples.length - 1; index >= 0; index -= 1) {
                const ripple = ripples[index];
                ripple.age += frameScale;
                const progress = Math.min(ripple.age / 82, 1);
                const easedProgress = 1 - Math.pow(1 - progress, 3);

                for (let ring = 0; ring < 3; ring += 1) {
                    const ringStart = ring * 0.09;
                    if (progress <= ringStart) continue;
                    const ringProgress = Math.min((progress - ringStart) / (1 - ringStart), 1);
                    const radius = 8 + ripple.radius * (1 - Math.pow(1 - ringProgress, 3));
                    const opacity = Math.pow(1 - ringProgress, 1.8) * (0.34 - ring * 0.075);
                    if (opacity <= 0.003) continue;

                    context.beginPath();
                    context.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
                    context.strokeStyle = `rgba(${ring === 1 ? "182, 255, 59" : "71, 255, 226"}, ${opacity})`;
                    context.lineWidth = (4.5 - ring) * (1 - ringProgress * 0.55);
                    context.shadowColor = "rgba(71, 255, 226, 0.72)";
                    context.shadowBlur = (22 - ring * 5) * (1 - ringProgress * 0.45);
                    context.stroke();
                }

                const glowRadius = 24 + ripple.radius * easedProgress;
                const glow = context.createRadialGradient(
                    ripple.x, ripple.y, Math.max(0, glowRadius - 16),
                    ripple.x, ripple.y, glowRadius
                );
                glow.addColorStop(0, "rgba(71, 255, 226, 0)");
                glow.addColorStop(0.75, `rgba(71, 255, 226, ${Math.pow(1 - progress, 2) * 0.035})`);
                glow.addColorStop(1, "rgba(71, 255, 226, 0)");
                context.shadowBlur = 0;
                context.fillStyle = glow;
                context.fillRect(ripple.x - glowRadius, ripple.y - glowRadius, glowRadius * 2, glowRadius * 2);
                context.shadowBlur = 0;
                if (progress >= 1) ripples.splice(index, 1);
            }
        }

        function render(time) {
            context.clearRect(0, 0, width, height);
            if (cursorContext) cursorContext.clearRect(0, 0, width, height);
            const deltaTime = previousFrameTime ? Math.min(time - previousFrameTime, 34) : 16.67;
            const frameScale = deltaTime / 16.67;
            const pointerEase = 1 - Math.exp(-deltaTime / 62);
            previousFrameTime = time;
            scrollVelocity += (scrollTarget - scrollVelocity) * 0.22;
            scrollTarget *= 0.86;
            pointer.x += (pointer.targetX - pointer.x) * pointerEase;
            pointer.y += (pointer.targetY - pointer.y) * pointerEase;
            const pointerDeltaX = pointer.x - previousSmoothPointer.x;
            const pointerDeltaY = pointer.y - previousSmoothPointer.y;
            if (Math.hypot(pointerDeltaX, pointerDeltaY) > 0.05) {
                const targetAngle = Math.atan2(pointerDeltaY, pointerDeltaX) * (180 / Math.PI) + 35;
                const angleDelta = ((targetAngle - cursorAngle + 540) % 360) - 180;
                cursorAngle += angleDelta * pointerEase;
            }
            previousSmoothPointer.x = pointer.x;
            previousSmoothPointer.y = pointer.y;

            drawAmbientGlow(time);
            if (!motionPreference.matches) {
                drawParticles(frameScale);
                drawCursor(frameScale);
                drawRipples(frameScale);
            } else {
                drawParticles(0);
            }

            if (cursorContext && cursorTracker && pointer.targetX >= 0) {
                cursorTracker.style.transform =
                    `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%) rotate(${cursorAngle}deg)`;
            }
        }

        function animate(time) {
            render(time);
            animationFrame = window.requestAnimationFrame(animate);
        }

        window.addEventListener("pointermove", (event) => {
            if (event.pointerType === "touch") return;
            pointer.targetX = event.clientX;
            pointer.targetY = event.clientY;
            if (cursorTracker) cursorTracker.classList.add("is-visible");

            const distance = Math.hypot(event.clientX - previousPointer.x, event.clientY - previousPointer.y);
            if (!motionPreference.matches && distance > 30) {
                interactionParticles.push({
                    x: event.clientX,
                    y: event.clientY,
                    vx: (Math.random() - 0.5) * 0.35,
                    vy: (Math.random() - 0.5) * 0.35,
                    age: 0,
                    life: 26,
                    size: 1.5 + Math.random() * 1.5,
                    color: ambientColors[Math.floor(Math.random() * ambientColors.length)]
                });
                if (interactionParticles.length > 120) interactionParticles.shift();
                previousPointer.x = event.clientX;
                previousPointer.y = event.clientY;
            }
        }, { passive: true });

        window.addEventListener("pointerout", (event) => {
            if (!event.relatedTarget && cursorTracker) cursorTracker.classList.remove("is-visible");
        }, { passive: true });

        window.addEventListener("pointermove", (event) => {
            if (event.pointerType === "touch" || !cursorTracker) return;
            const target = event.target instanceof Element
                ? event.target.closest("a, button, .hobby-card, .hero-art")
                : null;
            cursorTracker.classList.toggle("is-hovering", Boolean(target));
        });

        window.addEventListener("pointerdown", (event) => addRipple(event.clientX, event.clientY), { passive: true });
        window.addEventListener("scroll", () => {
            const now = performance.now();
            const elapsed = Math.max(now - lastScrollTime, 1);
            scrollTarget = Math.max(-72, Math.min(72, ((window.scrollY - lastScrollY) / elapsed) * 24));
            lastScrollY = window.scrollY;
            lastScrollTime = now;
        }, { passive: true });
        window.addEventListener("resize", resizeCanvas, { passive: true });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                window.cancelAnimationFrame(animationFrame);
                animationFrame = 0;
                previousFrameTime = 0;
            } else if (!motionPreference.matches && !animationFrame) {
                animationFrame = window.requestAnimationFrame(animate);
            } else if (!motionPreference.matches) {
                previousFrameTime = 0;
            }
        });

        motionPreference.addEventListener("change", () => {
            if (motionPreference.matches) {
                window.cancelAnimationFrame(animationFrame);
                animationFrame = 0;
                render(performance.now());
                if (cursorTracker) cursorTracker.classList.remove("is-visible");
            } else if (!document.hidden && !animationFrame) {
                previousFrameTime = 0;
                animationFrame = window.requestAnimationFrame(animate);
            }
        });

        resizeCanvas();
        if (!motionPreference.matches) animationFrame = window.requestAnimationFrame(animate);
    }
}
