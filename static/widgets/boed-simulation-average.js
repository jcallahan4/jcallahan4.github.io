/* Four simulation steps and their accumulated Monte Carlo information gains. */
(function () {
  "use strict";
  var model = window.BoedArizona, svg = document.getElementById("scene");
  var ns = "http://www.w3.org/2000/svg";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var running = !reduced, rng, current, phase, elapsed, results, sum, previous = null;
  var drawing = document.createElementNS(ns, "g");
  svg.appendChild(drawing);

  function node(tag, attrs, parent, content) {
    var el = document.createElementNS(ns, tag);
    Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    if (content !== undefined) el.textContent = content;
    (parent || drawing).appendChild(el);
    return el;
  }
  function text(x, y, content, options, parent) {
    return node("text", Object.assign({x:x, y:y, "font-size":20}, options || {}), parent, content);
  }
  function line(x1, y1, x2, y2, options, parent) {
    return node("line", Object.assign({x1:x1, y1:y1, x2:x2, y2:y2, stroke:"var(--line)"}, options || {}), parent);
  }
  function group(active) { return node("g", {opacity:active ? 1 : 0.18}); }
  // Coordinates linearly map source position and density to the panel bounds.
  function density(parent, x, result) {
    var baseline = 157, height = 101, width = 185;
    var peak = Math.max.apply(null, result ? model.prior.concat(result.density) : model.prior) * 1.12;
    function px(theta) { return x + width * theta / 10; }
    function py(value) { return baseline - height * value / peak; }
    function path(values) {
      return model.grid.map(function (theta, i) {
        return (i ? "L" : "M") + px(theta).toFixed(2) + " " + py(values[i]).toFixed(2);
      }).join(" ");
    }
    line(x, baseline, x+width, baseline, {}, parent);
    [0, 5, 10].forEach(function (value) {
      text(px(value), 179, value, {"text-anchor":"middle", class:"tick"}, parent);
    });
    node("path", {d:path(model.prior), class:"prior"}, parent);
    if (result) node("path", {d:path(result.density), class:"posterior"}, parent);
    return {x:px, y:py, baseline:baseline};
  }

  function controls() {
    var button = document.getElementById("play");
    button.textContent = running ? "Pause" : "Play";
    button.setAttribute("aria-label", running ? "Pause simulation" : "Play simulation");
    svg.dataset.playing = running;
  }
  function announce() {
    document.getElementById("simulation-status").textContent = "Simulation " + results.length +
      ": information gain " + current.ig.toFixed(2) + " nats. Mean " + (sum/results.length).toFixed(2) + " nats.";
  }
  function complete() {
    if (phase === 3) return;
    phase = 3;
    results.push(current);
    sum += current.ig;
    announce();
  }
  function startNext() {
    current = model.experiment(rng, model.design, model.sigma);
    phase = 0;
    elapsed = 0;
  }
  function reset() {
    rng = model.random(498231);
    results = [];
    sum = 0;
    previous = null;
    startNext();
    if (reduced) complete();
    render();
    controls();
  }

  function render() {
    drawing.replaceChildren();
    var number = results.length + (phase === 3 ? 0 : 1);
    ["1  Sample source", "2  Simulate data", "3  Update belief", "4  Compute gain"].forEach(function (label, i) {
      text(18+i*260, 25, label, {style:"font-size:22px;fill:"+(i===phase ? "var(--red)" : "var(--navy)")});
      if (i) line(i*260, 43, i*260, 208, {stroke:"var(--faint)"});
    });
    var prior = group(true), xy = density(prior, 45, null);
    line(xy.x(current.source), 56, xy.x(current.source), xy.baseline,
      {stroke:"var(--red)", "stroke-dasharray":"4 4"}, prior);
    node("circle", {cx:xy.x(current.source), cy:xy.baseline, r:5, fill:"var(--red)"}, prior);
    text(137, 207, "θ′ = "+current.source.toFixed(2), {"text-anchor":"middle"}, prior);

    var physical = group(phase >= 1);
    // Source and sensor use the same position coordinate: x = 283 + 216 θ/14.
    var position = function (value) { return 283 + 216*value/14; };
    var sourceX = position(current.source), sensorX = position(model.design);
    line(283, 157, 499, 157, {}, physical);
    [13, 26, 39].forEach(function (radius) {
      node("circle", {cx:sourceX, cy:125, r:radius, fill:"none", stroke:"var(--red)", opacity:0.24}, physical);
    });
    node("circle", {cx:sourceX, cy:125, r:6, fill:"var(--red)"}, physical);
    line(sensorX, 157, sensorX, 119, {stroke:"var(--navy)", "stroke-width":3}, physical);
    node("circle", {cx:sensorX, cy:115, r:7, fill:"var(--navy)"}, physical);
    text(390, 76, "Signal + noise", {"text-anchor":"middle", class:"small", style:"font-size:20px"}, physical);
    text(390, 207, phase>=1 ? "y′ = "+current.observation.toFixed(3) : "y′ = —", {"text-anchor":"middle"}, physical);

    var posterior = group(phase >= 2);
    density(posterior, 565, phase>=2 ? current : null);
    line(563, 201, 586, 201, {class:"prior"}, posterior);
    text(592, 207, "Prior", {style:"font-size:18px"}, posterior);
    line(648, 201, 671, 201, {class:"posterior"}, posterior);
    text(677, 207, "Posterior", {style:"font-size:18px"}, posterior);

    var gain = group(phase >= 3);
    text(910, 111, phase>=3 ? current.ig.toFixed(2) : "—", {"text-anchor":"middle", class:"value", style:"font-size:44px"}, gain);
    text(910, 143, "nats", {"text-anchor":"middle"}, gain);
    // Information gain is KL(p(θ|y,d) || p(θ)), measured with natural logarithms.
    text(910, 195, "KL(posterior ‖ prior)", {"text-anchor":"middle", style:"font-size:18px"}, gain);

    line(18, 222, 1022, 222, {stroke:"var(--faint)"});
    text(18, 250, "Information gain (nats)", {style:"font-size:22px"});
    // Monte Carlo EIG: mean_N = (1/N) Σᵢ KL(p(θ|yᵢ,d) || p(θ)); yᵢ are independent prior-predictive draws.
    var mean = results.length ? sum/results.length : null;
    text(1020, 250, "Mean: "+(mean===null ? "—" : mean.toFixed(2)+" nats"),
      {"text-anchor":"end", style:"font-size:22px;fill:var(--red)"});
    var b = {x:68, y:267, w:937, h:73};
    var maxGain = Math.max.apply(null, [1.8].concat(results.map(function (result) { return result.ig; })));
    var ymax = Math.ceil(maxGain*1.12*2)/2;
    var slots = Math.max(10, Math.ceil(results.length/10)*10);
    function bx(index) { return b.x+b.w*(index+0.5)/slots; }
    function by(value) { return b.y+b.h*(1-value/ymax); }
    [0, ymax/2, ymax].forEach(function (value) {
      line(b.x, by(value), b.x+b.w, by(value), {stroke:"var(--faint)"});
      text(b.x-12, by(value)+6, Number(value.toFixed(2)), {"text-anchor":"end", class:"tick"});
    });
    var tickStep = slots <= 10 ? 1 : Math.ceil(slots/10);
    for (var tick=0; tick<slots; tick+=tickStep) {
      text(bx(tick), 361, tick+1, {"text-anchor":"middle", class:"tick"});
    }
    results.forEach(function (result, index) {
      var width = b.w/slots*0.68;
      var bar = node("rect", {x:bx(index)-width/2, y:by(result.ig), width:width, height:by(0)-by(result.ig),
        fill:"var(--navy)", "fill-opacity":index===results.length-1 && phase===3 ? 0.85 : 0.45,
        class:"gain-bar", "data-gain":result.ig, "data-index":index});
      node("title", {}, bar, "Simulation "+(index+1)+": "+result.ig.toFixed(3)+" nats");
    });
    if (mean!==null) {
      line(b.x, by(mean), b.x+b.w, by(mean), {id:"mean-line", stroke:"var(--red)", "stroke-width":2.5});
    } else {
      text(535, 308, "One bar per completed simulation", {"text-anchor":"middle", class:"small"});
    }
    text(535, 382, "Simulated experiment", {"text-anchor":"middle", style:"font-size:18px"});
    document.getElementById("simulation-count").textContent = "Simulation "+number;
    Object.assign(svg.dataset, {phase:phase, samples:results.length, mean:mean===null ? "" : mean,
      source:current.source, observation:current.observation, ig:current.ig,
      priorArea:model.integrate(model.prior), posteriorArea:model.integrate(current.density),
      design:model.design, sigma:model.sigma});
  }

  document.getElementById("play").addEventListener("click", function () {
    running = !running;
    previous = null;
    controls();
  });
  document.getElementById("next").addEventListener("click", function () {
    if (phase === 3) startNext();
    complete();
    elapsed = 0;
    previous = null;
    render();
  });
  document.getElementById("reset").addEventListener("click", reset);
  document.addEventListener("visibilitychange", function () { previous = null; });
  function frame(now) {
    var dt = previous===null || document.hidden ? 0 : Math.min(100, now-previous);
    previous = now;
    if (running && dt) {
      elapsed += dt;
      // The first examples progress slowly; later repetitions accumulate faster.
      var duration = results.length<1 ? 1600 : results.length<3 ? 1200 : 750;
      if (phase<3 && elapsed>=duration) {
        elapsed = 0;
        if (phase===2) complete(); else phase++;
        render();
      } else if (phase===3 && elapsed>=duration*1.5) {
        startNext();
        render();
      }
    }
    requestAnimationFrame(frame);
  }
  reset();
  requestAnimationFrame(frame);
})();
