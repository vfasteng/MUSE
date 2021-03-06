import Sands from './cmp_mathbox/Sands';
import Chart from './cmp_mathbox/Chart';
import DataLoader from './cmp_mathbox/DataLoader'
import state from './cmp_mathbox/State';
import {Game} from 'core/Game';

import 'yuki-createjs/lib/tweenjs-0.6.2.combined';
import MathBox from 'mathbox';
import _ from 'lodash';

const chartScale=[1.5,1,1.5];
const chartRange={
    x:[1850, 2300],
    y:[12, 24],
    z:[-5, 5]
}

const startYear = 1850
const endYear = 2300
const yearPerMinute = () => state.yearPerMinute || 25 // * 12 // 25=>18min
const secPerYear = () => 60/yearPerMinute();
const Parameters = ['temperature', 'co2', 'ice', 'balance', 'precipitation'];

class CMPDataVizController {

    //constructor(renderer, scene, camera, options) {
    constructor(game, options) {
        this.game = game;
        var scene = game.scene;
        var camera = game.camera;
        //var renderer = game.renderer;
        var renderer = game.getUnderlyingRenderer();
        options = options || {};
        this.position = options.position || [0, 0, 0];
        this.rotation = options.rotation || [0, 0, 0];

        // 1 show bad graph. 0 show good graph. in between is a blend
        this.graphRate = 1;
        var visible = true;
        if (options.visible != null)
            visible = options.visible;
        this.rotationSpeed = options.rotationSpeed || 0; // in degrees per second
        this.scale = options.scale || chartScale;
        this.state = state;
        this.state.playState = 'play';

        if (options.duration) {
            this.state.yearPerMinute = (endYear - startYear)/(options.duration/60);
        }
        this.state.startTime = options.startTime || 0;
        this.state.duration = options.duration || 18*60;

        let self = this;
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.context = new MathBox.Context(renderer, scene, camera);
        this.context.init();
        this.resize(renderer.domElement.width, renderer.domElement.height);

        this.loader = new DataLoader();
        this.loader.load().then((data) => {
            self.data = data;
            self.numData = data.active.year.length;
            self._drawMathbox(data);
        });
        this.currRot = [0, 0, 0];
        this.visible = visible;
        this._updateTime = this._updateTime.bind(this);

        game.state.on('time', this._updateTime);
        game.state.on("playRequested", () => {
            this.play();
        });
        game.state.on("pauseRequested", () => {
            this.pause();
        });
    }

    reset() {
        if (this.context) {
            this.context.destroy();
        }
        this.context = new MathBox.Context(this.renderer, this.scene, this.camera);
        this.context.init();
        this.resize(this.renderer.domElement.width, this.renderer.domElement.height);
        this._drawMathbox(this.loader.data);
    }

    _drawMathbox(datas) {
        let data = datas.active;
        let mathbox = this.context.api;

        // Mathbox view
        var view = this.view;
        var view = mathbox.cartesian({
            range: [chartRange.x, chartRange.y, chartRange.z],
            scale: chartScale,
            position: this.position,
            rotation: this.rotation
        });

        this.gridView = view;

        var origin = {
            x: chartRange.x[0],
            y: chartRange.y[0],
            z: chartRange.z[0]
        };
        // var origin = {x:0, y:0, z:0};

        this._drawGrid(view, origin);
        this._drawCharts(data, view, origin);

        if (state.showYear) {
            // Draw year label
            view.array({
                id: 'label-year',
                data: [[
                    0.0 * chartRange.x[0] + 1.0 * chartRange.x[1],
                    1.3 * chartRange.y[1] + (-0.3) * chartRange.y[0],
                    chartRange.z[0]
                ]],
                channels: 3, // necessary
                live: true,
            }).text({
                id: 'label-year-text',
                data: ['Year'],
            }).label({
                color: 0xffffff,
                background: state.colors.bg,
                size: 36*3,
                depth: 1
            });

            var labelYearText = mathbox.select("#label-year-text")
            this.labelYearText = labelYearText;
        }

        this.update();
    }

    _drawCharts(data, view, origin) {

        let mathbox = this.context.api;
        var charts = {}
        this.charts = charts;

        // color gradient for temperature curve
        view.interval({
            id:'tempratureColor',
            width: state.numData,
            channels: 4,
            items: 1,
            live: true,
            expr: (emit, x, i, t)=>{
                var min = 13
                var max = 23
                var val = data.temperature[i]

                var r0 = 1 - (val-min) / (max-min) // Green percentage
                var r1 = 1 - r0

                var c0 = [0.1, 0.7, 1] // Blue
                var c1 = [1, 0.2, 0.1] // Red
                var r = r0*c0[0]+r1*c1[0]
                var g = r0*c0[1]+r1*c1[1]
                var b = r0*c0[2]+r1*c1[2]
                var a = 1.0-Math.pow(Math.sin(t*3), 16) + r0 + 0.2
                if (x > state.Year) a *= 0.0
                emit(r, g, b, a) // make it blink alarm at high temperature
            }
        })

        // line alpha for co2 and balance curve
        // controlling part of line this is visible to creating years marching forward effect
        view.interval({
            id:'lineAlpha',
            width: state.numData,
            channels: 4,
            items: 1,
            live: true,
            expr: (emit, x, i, t)=>{
                var a = x > state.Year ? 0.0 : 1.0
                emit(1, 1, 1, a) // make it blink alarm at high temperature
            }
        })

        charts['temperature'] = new Chart(mathbox, {
            position: this.position,
            view: view,
            data: this.loader.data,
            x : data.year,
            y : data['temperature'],
            z_offset : -5,
            id : 'temperature',
            xRange : chartRange.x,
            yRange : [12, 24],
            zRange : chartRange.z,
            scale : chartScale,
            // color : 0xffcc44,
            color : 0xffffff,
            dotColor : 0x44bbff,
            colors : '#tempratureColor',
            //labelSize : labelSize,
            lineWidth : state.tempLineWidth,
            labelFunc: (year, val)=>{
                //return [''+year+': '+val+'\u2103 increase']
                //var str = val+'\u2103 increase';
                var str = val+'\u2103';
                // $("#tempVal").html(""+val+"&deg;C");
                return [str]
            }
        })

        charts['balance'] = new Chart(mathbox, {
            position: this.position,
            view: view,
            data: this.loader.data,
            x : data.year,
            y : data['balance'],
            z_offset : 0,
            id : 'balance',
            xRange : chartRange.x,
            yRange : [-1, 8],
            zRange : chartRange.z,
            scale : chartScale,
            //color : 0x00ffff,
            color : 0x02ff7f,
            colors : '#lineAlpha',
            //labelSize : labelSize,
            lineWidth: state.balanceLineWidth,
            labelFunc: (year, val)=>{
                //return [''+year+': '+val+' energy balance']
                //str = val + 'balance';
                var str = ''+val;
                // $("#energyVal").html(str);
                return [str];
            }
        })

        charts['co2'] = new Chart(mathbox, {
            position: this.position,
            view: view,
            data: this.loader.data,
            x : data.year,
            y : data['co2'],
            z_offset : 5,
            id : 'co2',
            xRange : chartRange.x,
            yRange : [0, 2200],
            zRange : chartRange.z,
            scale : chartScale,
            color : 0xaf8f30,
            colors : '#lineAlpha',
            lineWidth : state.co2LineWidth,
            //labelSize : labelSize,
            labelFunc: (year, val)=>{
                //return [''+year+': '+val+'PPM increase']
                //var str = val+'PPM increase';
                var str = val+'PPM';
                // $("#co2Val").html(str);
                return [str];
            }
        })

        // draw sands
	    this.sands = new Sands(mathbox, {
            x : data.year,
            y : data['temperature'],
            z_offset : -10,
            id : 'sands',
            position: this.position,
            xRange : chartRange.x,
            yRange : [12, 24],
            zRrange : chartRange.z,
            scale : chartScale,
            // color : 0xffcc44,
            color : 0xffffff,
            colors : '#tempratureColor'
	    })
    }

    _drawGrid(view, origin) {
        const lineWidth = state.gridLineWidth;
        const alpha = 0.3;

        view
            .transform({
                position:[0, origin.y, 0]
            })
            .grid({
                axes: "zx",
                divideX: 4,
                divideY: 5,
                niceX: false,
                niceY: false,
                width: lineWidth,
            });

        view
            .transform({
                position:[2300, 0, 0]
            })
            .grid({
                axes: "yz",
                divideX: 4,
                divideY: 4,
                niceX: false,
                niceY: false,
                width: lineWidth,
            });

        this.play();
    }

    updateData() {
        var state = this.state;
        if (!this.loader.data) {
            console.log("No data yet");
            return;
        }
        var data = this.loader.data.active;
        var varNames = ["co2", "balance", "temperature"];
        var year = state.Year;
        game.state.set("year", year);
        varNames.forEach(id => {
            var dat = data[id];
            var val = dat[year - 1850];
            //console.log('year: '+year+" "+id+" "+val);
            if (val) {
                game.state.set(id, val);
            }
        });
    }

    update(t) {
        // update the year
        if (this.labelYearText) {
            this.labelYearText.set('data', ['Year ' + this.state.Year]);
        }
        this.updateData()
        // TWEEN.update();
        if (this.charts) {
            let data = this.loader.data.active;
            let charts = this.charts;
            Object.keys(charts).forEach(id => {
                charts[id].update(data[id])
            });
            this.sands.update(data['temperature']);
        }

        // animate the graph
        //this.currRot[1] += Math.PI*2/3600;
        this.currRot[1] += this.rotationSpeed * (Math.PI*2 / 360) / 60.0;
        if (this.currRot[1] > Math.PI*2) {
            this.currRot[1] -= Math.PI*2;
        }
        this.rotation = this.currRot;

        if (this.dirty) {
            this._updateMatrix();
        }

        this.context.frame();
    }

    resize(w, h) {
        this.context.resize({
            viewWidth: w, viewHeight: h
        });
    }

    // seek val 0 -> 1 : years 1850 -> 2300
    seekNormalize(val) {
        var start = startYear + parseInt(val*(endYear - startYear));
        var dur = (endYear - start)*(secPerYear());
        this._updateTween(dur, start, endYear)
    }

    play() {
        this.state.playState = 'play';
        let t = game.state.get('time')
        var dt = t - this.state.startTime;
        var normalizedTime = dt/this.state.duration;
        this.seekNormalize(normalizedTime);

        // Tween.js has a broken play() function.  It doesn't work after paused
        // if (this.historyT1)
        //     this.historyT1.play();
        // if (this.historyT2)
        //     this.historyT2.play();
    }

    pause() {
        this.state.playState = 'pause';
        this._stopHistory();
    }

    stop() {
        this.state.playState = 'stop';
        this._stopHistory();
    }

    _createChartTween(initYear, startYear, endYear, showGood) {
        let rate = { r: this.graphRate }
        let delay = 0;
        let duration = (endYear - startYear)*secPerYear()*1000;

        let tween = createjs.Tween.get(rate);
        let self = this;
        tween
            .to({r: showGood ? 0 : 1}, duration)
            .on('change', () => {
                self.setActiveData(rate.r);
            });

        // figure out if we need to delay the tween
        if (initYear < startYear) {
            let delay = (startYear - initYear)*secPerYear()*1000;
            tween.wait(delay);
        }

        return tween;
    }

    _updateGraph(year) {
        const goodStartYear = 2150;
        const goodEndYear = 2155;
        const badStartYear = 2190;
        const badEndYear = 2195;
        if (year >= goodStartYear && year < goodEndYear) {
            let rate = (year - goodStartYear)/(goodEndYear - goodStartYear);
            this.setActiveData(1 - rate);
        } else if (year >= badStartYear) {
            let rate = (year - badStartYear)/(badEndYear - badStartYear);
            if (rate > 1) {
                rate = 1;
            }
            this.setActiveData(rate);
        } else {
            this.setActiveData(1);
        }
    }

    _updateTween(_duration, _from, _to) {
        this._stopHistory()
        var duration = _duration || 120 // 2min
        var param = {y: _from}
        this.historyT1 = createjs.Tween.get(param, { paused: this.state.playState == 'pause' });
        this.historyT1
            .wait(4000)
            .to({y:_to}, duration*1000)
            .on('change', ()=>{
                state.SandYear = Math.round(param.y)
            })
        state.SandYear = _from;

        var param1 = {y: _from}
        this.historyT2 = createjs.Tween.get(param1, { paused: this.state.playState == 'pause' })
        this.historyT2
            .to({y:_to}, duration*1000)
            .on('change', ()=>{
                this._updateGraph(param1.y);
                let year = Math.round(param1.y);
                if (year != state.Year) {
                    state.Year = year;
                }
            })
        state.Year = _from;

        // create tween to go from bad -> good & good -> bad
        //this.badHistoryTween = this._createChartTween(_from, 2150, 2190, true);
        //this.goodHistoryTween = this._createChartTween(_from, 2190, _to, false);
    }

    _stopHistory() {
        if (this.historyT1 && this.historyT2) {
            createjs.Tween.removeTweens(this.historyT1._target);
            createjs.Tween.removeTweens(this.historyT2._target);
        }
    }

    // array x,y,z [0, 0, 0]
    set position(pos) {
        // Some validation etc.
        this._position = pos;
        this.dirty = true;
    }

    get position() {
        return this._position || [0, 0, 0];
    }

    // array x,y,z [0, 0, 0]
    set rotation(pos) {
        // Some validation etc.
        this._rotation = pos;
        this.dirty = true;
    }

    get rotation() {
        return this._rotation || [0, 0, 0];
    }

    // array x,y,z [0, 0, 0]
    set scale(pos) {
        // Some validation etc.
        this._scale = pos;
        this.dirty = true;
    }

    get scale() {
        return this._scale || [1, 1, 1];
    }

    // array x,y,z [0, 0, 0]
    set visible(val) {
        this._visible = val;
        _.set(this, "context.scene.root.visible", val);
        (val) ? this.play() : this.stop();
    }

    get visible() {
        return this._visible;
    }

    _updateMatrix() {
        if (this.context) {
            let mathbox = this.context.api;
            mathbox.
                select('cartesian')
                .set('rotation', this._rotation)
                .set('position', this._position)
                .set('scale', this._scale);
        }
    }

    _updateTime(t) {
        // check if seek changed
        if (game.state.get('seek')) {
            if (t > this.state.startTime) {
                var dt = t - this.state.startTime;
                var normalizedTime = dt/this.state.duration;
                this.seekNormalize(normalizedTime);
            } else {
                state.Year = startYear;
                this.stop();
            }
        }

        if (t > this.state.startTime && this.lastTS < this.state.startTime) {
            this.seekNormalize(0);
            if (this.state.playState == 'play') {
                this.play();
            }
        }

        this.lastTS = t;
    }

    // set active = r*rcp8.5 + (1-r)*rcp2.6
    setActiveData(r) {
        let self = this;
        if (self.graphRate != r) {
            self.graphRate = r;
            for (var i=0; i< self.numData; i++) {
                Parameters.forEach(p=>{
                    self.data.active[p][i] = self.data.rcp8p5[p][i] * r + self.data.rcp2p6[p][i] * (1.0-r)
                })
            }
        }
    }
}

function addCMPDataViz(game, options)
{
    var cmp = new CMPDataVizController(game, options);
    game.registerController('cmp', cmp);
    return cmp;
}

Game.registerNodeType("CMPDataViz", addCMPDataViz);

export {CMPDataVizController};
