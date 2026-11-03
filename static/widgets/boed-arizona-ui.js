(function () {
  "use strict";
  var model = window.BoedArizona, svg = document.getElementById("scene");
  var ns = "http://www.w3.org/2000/svg";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function node(tag, attrs, parent, content) {
    var el = document.createElementNS(ns, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (content !== undefined) el.textContent = content;
    (parent || svg).appendChild(el);
    return el;
  }
  function text(x, y, content, parent, attrs) {
    var properties=Object.assign({x:x,y:y},attrs||{});
    if(properties.fill)properties.style=(properties.style||"")+";fill:"+properties.fill;
    return node("text", properties, parent, content);
  }
  function group() { return node("g", {}, svg); }
  function niceMax(values, floor) {
    var peak = Math.max(floor || 0.3, Math.max.apply(null, values));
    var unit = Math.pow(10, Math.floor(Math.log10(peak)));
    return Math.ceil(peak * 1.12 / unit) * unit;
  }
  // Plot coordinates linearly map data ranges onto SVG bounds.
  function coordinates(b, xmin, xmax, ymax) {
    return {x:function (v) { return b.x + b.w * (v - xmin) / (xmax - xmin); },
      y:function (v) { return b.y + b.h * (1 - v / ymax); }};
  }
  function path(xs, ys, xy) {
    return xs.map(function (x, i) { return (i ? "L" : "M") + xy.x(x).toFixed(2) + " " + xy.y(ys[i]).toFixed(2); }).join(" ");
  }
  function axes(parent, b, xmin, xmax, ymax, xticks, compact) {
    var xy = coordinates(b, xmin, xmax, ymax), font = compact ? 14 : 17;
    [0, ymax / 2, ymax].forEach(function (value) {
      node("line", {x1:b.x, x2:b.x+b.w, y1:xy.y(value), y2:xy.y(value), stroke:"var(--faint)"}, parent);
      text(b.x-9, xy.y(value)+5, Number(value.toPrecision(2)), parent,
        {"text-anchor":"end", class:"tick", style:"font-size:"+font+"px"});
    });
    node("path", {d:"M"+b.x+" "+b.y+" V"+(b.y+b.h)+" H"+(b.x+b.w), class:"axis"}, parent);
    xticks.forEach(function (value) {
      node("line", {x1:xy.x(value), x2:xy.x(value), y1:b.y+b.h, y2:b.y+b.h+5, stroke:"var(--line)"}, parent);
      text(xy.x(value), b.y+b.h+24, value, parent, {"text-anchor":"middle", class:"tick", style:"font-size:"+font+"px"});
    });
    return xy;
  }
  function density(parent, b, result, compact) {
    var max = niceMax(result ? model.prior.concat(result.density) : model.prior);
    var xy = axes(parent, b, 0, 10, max, compact ? [0,5,10] : [0,2,4,6,8,10], compact);
    if (result) {
      var d = path(model.grid, result.density, xy);
      node("path", {d:d+" L"+(b.x+b.w)+" "+(b.y+b.h)+" L"+b.x+" "+(b.y+b.h)+" Z",
        fill:"var(--red)", "fill-opacity":0.08}, parent);
    }
    node("path", {d:path(model.grid, model.prior, xy), class:"prior"}, parent);
    if (result) node("path", {d:path(model.grid, result.density, xy), class:"posterior"}, parent);
    return xy;
  }
  function legend(parent, x, y, compact) {
    var size = compact ? 16 : 20, gap = compact ? 100 : 150;
    node("line", {x1:x, x2:x+30, y1:y, y2:y, class:"prior"}, parent);
    text(x+40,y+6,"Prior",parent,{style:"font-size:"+size+"px"});
    node("line", {x1:x+gap, x2:x+gap+30, y1:y, y2:y, class:"posterior"}, parent);
    text(x+gap+40,y+6,"Posterior",parent,{style:"font-size:"+size+"px"});
  }
  function diagnostics(result) {
    svg.dataset.observation = result.observation;
    svg.dataset.design = result.design;
    svg.dataset.sigma = result.sigma;
    svg.dataset.ig = result.ig;
    svg.dataset.posteriorArea = model.integrate(result.density);
    svg.dataset.priorArea = model.integrate(model.prior);
  }
  function clock(update) {
    var running = !reduced, previous = null, time = 0, button = document.getElementById("play");
    function label() {
      button.textContent = running ? "Pause" : "Play";
      button.setAttribute("aria-label", running ? "Pause animation" : "Play animation");
      svg.dataset.playing = running;
    }
    button.addEventListener("click", function () { running = !running; previous = null; label(); });
    document.addEventListener("visibilitychange", function () { previous = null; });
    label();
    function frame(now) {
      var dt = previous === null || document.hidden ? 0 : Math.min(100, now - previous);
      previous = now;
      if (running && dt) { time += dt; update(time, dt); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function information() {
    var drawing = group(), slider = document.getElementById("observation");
    function render() {
      var observation = Number(slider.value), result = model.posterior(observation, model.design, model.sigma);
      drawing.replaceChildren();
      legend(drawing, 80, 18, false);
      density(drawing, {x:80,y:52,w:620,h:178}, result, false);
      text(390,284,"Source location, θ",drawing,{"text-anchor":"middle"});
      text(22,143,"Probability density",drawing,{"text-anchor":"middle",transform:"rotate(-90 22 143)"});
      text(755,68,"Information gain",drawing);
      text(755,119,result.ig.toFixed(2)+" nats",drawing,{class:"value"});
      var maximum = Math.max(5, Math.ceil(result.ig));
      node("line",{x1:755,x2:1000,y1:154,y2:154,stroke:"var(--faint)","stroke-width":9},drawing);
      node("line",{x1:755,x2:755+245*result.ig/maximum,y1:154,y2:154,stroke:"var(--red)","stroke-width":9},drawing);
      text(755,181,"0",drawing,{class:"tick"});
      text(1000,181,maximum,drawing,{class:"tick","text-anchor":"end"});
      // Information gain is D_KL(posterior || prior), with natural logarithms.
      text(755,227,"KL(posterior ‖ prior)",drawing,{style:"font-size:19px"});
      document.getElementById("observation-value").value = observation.toFixed(3);
      slider.setAttribute("aria-valuetext",observation.toFixed(3));
      diagnostics(result);
    }
    slider.addEventListener("input",render);
    render();
  }

  function simulation() {
    var drawing = group(), rng = model.random(20261103), result = model.experiment(rng,model.design,model.sigma);
    var phase = reduced ? 3 : 0, number = 1, start = 0;
    var headings = ["1  Sample source","2  Generate data","3  Update belief","4  Measure gain"];
    function render() {
      drawing.replaceChildren();
      for (var j=0;j<4;j++) {
        text(18+j*260,27,headings[j],drawing,{fill:j===phase?"var(--red)":"var(--navy)",style:"font-size:18px"});
        if(j===phase)node("line",{x1:18+j*260,x2:240+j*260,y1:39,y2:39,stroke:"var(--red)","stroke-width":2},drawing);
        if(j)node("line",{x1:j*260,x2:j*260,y1:53,y2:278,stroke:"var(--faint)"},drawing);
      }
      var priorXY=density(drawing,{x:52,y:73,w:183,h:134},null,true);
      node("line",{x1:priorXY.x(result.source),x2:priorXY.x(result.source),y1:73,y2:207,
        stroke:"var(--red)","stroke-width":1.5,"stroke-dasharray":"4 4"},drawing);
      node("circle",{cx:priorXY.x(result.source),cy:207,r:5,fill:"var(--red)"},drawing);
      text(143,248,"Source location, θ",drawing,{"text-anchor":"middle",style:"font-size:17px"});
      text(130,283,"θ′ = "+result.source.toFixed(2),drawing,{"text-anchor":"middle"});

      var physical=node("g",{opacity:phase>=1?1:0.23},drawing);
      // The source and sensor share a position axis from 0 to 14.
      var position=function(v){return 282+216*v/14;};
      node("line",{x1:282,x2:498,y1:184,y2:184,stroke:"var(--line)"},physical);
      [0,7,14].forEach(function(v){text(position(v),206,v,physical,{"text-anchor":"middle",class:"tick",style:"font-size:14px"});});
      var sourceX=position(result.source),sensorX=position(model.design);
      [12,24,36].forEach(function(r){node("circle",{cx:sourceX,cy:155,r:r,fill:"none",stroke:"var(--red)",opacity:0.25},physical);});
      node("circle",{cx:sourceX,cy:155,r:6,fill:"var(--red)"},physical);
      node("line",{x1:sensorX,x2:sensorX,y1:184,y2:151,stroke:"var(--navy)","stroke-width":4},physical);
      node("circle",{cx:sensorX,cy:148,r:7,fill:"var(--navy)"},physical);
      text(493,103,"Sensor: d = 12",physical,{"text-anchor":"end",style:"font-size:17px"});
      text(390,245,"Signal + noise",physical,{"text-anchor":"middle",class:"small"});
      text(390,283,phase>=1?"y′ = "+result.observation.toFixed(3):"y′ = —",drawing,{"text-anchor":"middle"});

      var updating=node("g",{opacity:phase>=2?1:0.23},drawing);
      density(updating,{x:567,y:73,w:183,h:134},phase>=2?result:null,true);
      legend(updating,551,246,true);
      text(650,283,"Updated belief",drawing,{"text-anchor":"middle"});
      var gaining=node("g",{opacity:phase>=3?1:0.23},drawing);
      text(910,137,phase>=3?result.ig.toFixed(2):"—",gaining,{"text-anchor":"middle",class:"value",style:"font-size:42px"});
      text(910,170,"nats",gaining,{"text-anchor":"middle"});
      text(910,222,"KL(posterior ‖ prior)",gaining,{"text-anchor":"middle",style:"font-size:18px"});
      text(910,283,"Information gain",gaining,{"text-anchor":"middle"});
      document.getElementById("simulation-count").textContent="Hypothetical experiment "+number;
      svg.dataset.phase=phase;svg.dataset.experiments=number;svg.dataset.source=result.source;
      diagnostics(result);
    }
    render();
    clock(function(time){
      if(time-start>=11200){start=time;number++;result=model.experiment(rng,model.design,model.sigma);phase=0;render();return;}
      var next=Math.min(3,Math.floor((time-start)/2300));
      if(next!==phase){phase=next;render();}
    });
  }

  function expectation() {
    var drawing=group(),rng=model.random(498231),experiments=[],selected=-1,sum=0;
    var simulateButton=document.getElementById("simulate"),resetButton=document.getElementById("reset");
    function select(index){
      selected=index;render();
      var bar=drawing.querySelector('[data-index="'+index+'"]');
      if(bar&&bar.focus)bar.focus();
    }
    function render(){
      var current=experiments[selected]||null,values=experiments.map(function(result){return result.ig;});
      // Monte Carlo EIG estimate: mean_N = (1/N) Σᵢ KL(p(θ|yᵢ,d) || p(θ)), with independent prior-predictive draws.
      var mean=experiments.length?sum/experiments.length:null;
      drawing.replaceChildren();
      legend(drawing,75,18,true);
      text(205,47,current?"Observation "+(selected+1):"Prior before simulation",drawing,{"text-anchor":"middle",class:"small",style:"font-size:15px"});
      density(drawing,{x:75,y:63,w:260,h:151},current,true);
      text(205,260,"Source location, θ",drawing,{"text-anchor":"middle",style:"font-size:18px"});
      text(205,290,current?"y′ = "+current.observation.toFixed(3)+" · KL = "+current.ig.toFixed(2)+" nats":"y′ = — · KL = —",drawing,{"text-anchor":"middle",class:"small",style:"font-size:16px"});
      node("rect",{x:475,y:11,width:17,height:13,fill:"var(--navy)",opacity:0.65},drawing);
      text(502,24,"KL per observation",drawing,{style:"font-size:18px"});
      node("line",{x1:720,x2:750,y1:18,y2:18,stroke:"var(--red)","stroke-width":3},drawing);
      text(760,24,"Mean (estimated EIG)",drawing,{style:"font-size:18px"});
      var b={x:477,y:63,w:517,h:151},ymax=niceMax(values,1);
      var slots=Math.max(10,Math.ceil(values.length/10)*10),ticks=[],tickStep=Math.max(1,Math.ceil(slots/10));
      for(var tick=1;tick<=slots;tick+=tickStep)ticks.push(tick);
      var xy=axes(drawing,b,0.5,slots+0.5,ymax,ticks,false);
      var annotations=[];
      values.forEach(function(value,i){
        var barWidth=b.w/slots*0.72;
        var bar=node("rect",{x:xy.x(i+1)-barWidth/2,y:xy.y(value),width:barWidth,height:xy.y(0)-xy.y(value),
          fill:"var(--navy)","fill-opacity":i===selected?0.8:0.45,stroke:i===selected?"var(--red)":"none","stroke-width":2,
          class:"kl-bar",role:"button",tabindex:0,"aria-pressed":i===selected,
          "aria-label":"Show posterior for observation "+(i+1)+", KL "+value.toFixed(2)+" nats",
          "data-index":i,"data-kl":value},drawing);
        node("title",{},bar,"Observation "+(i+1)+": KL = "+value.toFixed(3)+" nats");
        bar.addEventListener("click",function(){select(i);});
        bar.addEventListener("keydown",function(event){if(event.key==="Enter"||event.key===" "){event.preventDefault();select(i);}});
        if(slots<=20)annotations.push({x:xy.x(i+1),y:xy.y(value)-7,value:value.toFixed(2)});
      });
      if(mean!==null)node("line",{id:"mean-line",x1:b.x,x2:b.x+b.w,y1:xy.y(mean),y2:xy.y(mean),stroke:"var(--red)","stroke-width":2.5,"pointer-events":"none"},drawing);
      else text(736,141,"Simulate an observation to begin",drawing,{"text-anchor":"middle",class:"small"});
      annotations.forEach(function(label){text(label.x,label.y,label.value,drawing,{"text-anchor":"middle",class:"small",
        style:"font-size:"+(slots<=10?15:12)+"px;paint-order:stroke;stroke:white;stroke-width:4px;stroke-linejoin:round"});});
      text(736,260,"Simulated observation",drawing,{"text-anchor":"middle",style:"font-size:18px"});
      text(409,139,"KL divergence (nats)",drawing,{"text-anchor":"middle",transform:"rotate(-90 409 139)",style:"font-size:17px"});
      text(736,290,"Each observation starts from the same prior.",drawing,{"text-anchor":"middle",class:"small",style:"font-size:16px"});
      document.getElementById("sample-count").textContent="Observations: "+values.length;
      document.getElementById("estimate").textContent="Estimated EIG: "+(mean===null?"—":mean.toFixed(2)+" nats");
      resetButton.disabled=!values.length;
      svg.dataset.samples=values.length;svg.dataset.mean=mean===null?"":mean;svg.dataset.selected=selected;
      svg.dataset.design=model.design;svg.dataset.sigma=model.sigma;svg.dataset.priorArea=model.integrate(model.prior);
      if(current){diagnostics(current);svg.dataset.source=current.source;}
      else ["observation","ig","posteriorArea","source"].forEach(function(key){delete svg.dataset[key];});
    }
    simulateButton.addEventListener("click",function(){
      var result=model.experiment(rng,model.design,model.sigma);
      experiments.push(result);sum+=result.ig;selected=experiments.length-1;render();
      document.getElementById("simulation-status").textContent="Observation "+experiments.length+": "+result.observation.toFixed(3)+
        ". KL divergence "+result.ig.toFixed(2)+" nats. Estimated expected information gain "+(sum/experiments.length).toFixed(2)+" nats.";
    });
    resetButton.addEventListener("click",function(){
      rng=model.random(498231);experiments=[];selected=-1;sum=0;render();
      document.getElementById("simulation-status").textContent="Simulations cleared.";
    });
    render();
  }

  function design(){
    var scores=window.BoedArizonaDesignScores,drawing=group(),slider=document.getElementById("design");
    var best=scores.values.indexOf(Math.max.apply(null,scores.values));
    function render(){
      drawing.replaceChildren();
      var index=Number(slider.value),d=scores.designs[index],value=scores.values[index];
      var position=function(v){return 65+390*v/20;};
      text(65,25,"Best allowed location: d = "+scores.designs[best].toFixed(2),drawing,{fill:"var(--red)"});
      text(162,61,"Possible sources",drawing,{"text-anchor":"middle",class:"small"});
      text(367,61,"Allowed sensors",drawing,{"text-anchor":"middle",class:"small"});
      node("rect",{x:position(11),y:76,width:position(20)-position(11),height:137,fill:"var(--navy)","fill-opacity":0.045},drawing);
      var priorXY={x:position,y:function(v){return 213-120*v/0.3;}};
      node("path",{d:path(model.grid,model.prior,priorXY),class:"prior"},drawing);
      node("path",{d:"M65 213 H455",class:"axis"},drawing);
      [0,5,10,15,20].forEach(function(v){text(position(v),239,v,drawing,{"text-anchor":"middle",class:"tick"});});
      node("circle",{cx:position(scores.designs[best]),cy:213,r:7,fill:"white",stroke:"var(--red)","stroke-width":2},drawing);
      node("line",{x1:position(d),x2:position(d),y1:213,y2:171,stroke:"var(--navy)","stroke-width":4},drawing);
      node("circle",{cx:position(d),cy:168,r:7,fill:"var(--navy)"},drawing);
      text(position(d),150,"Sensor",drawing,{"text-anchor":d>18?"end":"middle",class:"small"});
      text(260,274,"Position",drawing,{"text-anchor":"middle"});
      text(620,25,"Expected gain: "+value.toFixed(2)+" nats",drawing);
      var b={x:620,y:63,w:374,h:150},xy=axes(drawing,b,11,20,niceMax(scores.values),[11,14,17,20],false);
      node("path",{d:path(scores.designs,scores.values,xy),fill:"none",stroke:"var(--navy)","stroke-width":3},drawing);
      node("circle",{cx:xy.x(scores.designs[best]),cy:xy.y(scores.values[best]),r:8,fill:"white",stroke:"var(--red)","stroke-width":2.5},drawing);
      node("circle",{cx:xy.x(d),cy:xy.y(value),r:5,fill:"var(--navy)"},drawing);
      text(807,274,"Sensor location, d",drawing,{"text-anchor":"middle"});
      text(552,139,"Expected gain (nats)",drawing,{"text-anchor":"middle",transform:"rotate(-90 552 139)",style:"font-size:17px"});
      document.getElementById("design-value").value=d.toFixed(2);
      slider.setAttribute("aria-valuetext",d.toFixed(2));
      svg.dataset.design=d;svg.dataset.eig=value;svg.dataset.bestDesign=scores.designs[best];svg.dataset.sigma=model.sigma;
    }
    slider.addEventListener("input",render);render();
  }
  ({information:information,simulation:simulation,expectation:expectation,design:design})[document.body.dataset.widget]();
})();
