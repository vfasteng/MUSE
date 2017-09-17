/**
 */

import * as THREE from 'three';
import { sprintf } from "sprintf-js";
import { getCameraParams } from '../../Util';

// The four arrow keys
var KEYS = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40, B: 66, W: 87, S: 83, A: 65, D: 68 };

var toDeg = THREE.Math.radToDeg;

function bind( scope, fn ) {
    return function () {
        fn.apply( scope, arguments );
    };
}

class JoelControls
{

    constructor(game, domElement, opts) {
        console.log("****** JoelControls.constructor()", opts);
        var inst = this;
        this.ignoredModels = ["stars"];
        this.game = game;
        game.xc = this; // debugging convenience
        this.object = game.camera;
        this.target = new THREE.Vector3( 0, 0, 0 );

        this.domElement = ( domElement !== undefined ) ? domElement : document;
        this.enabled = true;
        console.log("domElement "+this.domElement);

        this.keyPanSpeed = opts.keyPanSpeed || 0.01;
        this.whichButton = null;
        this.mouseDragOn = false;
        this.mousePtDown = null;
        this.anglesDown = null;
        this.camPosDown = null;
        this.panRatio = 0.005;
        this.pitchRatio = 0.005;
        this.lookSense = 1;
        this.prevView = null;
        this.speedRight = 0;
        this.speedForward = 0;
        this.speedRotateY = 0;
        this.raycaster = new THREE.Raycaster();
        this.raycastPt = new THREE.Vector2()

        this._onMouseMove = bind( this, this.onMouseMove );
        this._onMouseDown = bind( this, this.onMouseDown );
        this._onMouseWheel = bind( this, this.onMouseWheel );
        this._onMouseUp = bind( this, this.onMouseUp );
        this._onMouseClick = bind( this, this.onMouseClick );
        this._onContextMenu = bind(this, this.onContextMenu );

        this._onKeyDown = bind( this, this.onKeyDown );
        this._onKeyUp = bind( this, this.onKeyUp );
        /*
         */
        this.domElement.addEventListener( 'contextmenu',   this._onContextMenu, false );
        this.domElement.addEventListener( 'dblclick',         this._onMouseClick, false );
        this.domElement.addEventListener( 'mousedown',     this._onMouseDown, false );
        this.domElement.addEventListener( 'mouseup',       this._onMouseUp, false );
        this.domElement.addEventListener( 'mousemove',     this._onMouseMove, false );
        this.domElement.addEventListener( 'wheel',         this._onMouseWheel, false);
        this.domElement.addEventListener( 'DOMMouseScroll',this._onMouseWheel, false);
        window.addEventListener( 'keydown',       this._onKeyDown, false);
        window.addEventListener( 'keyup',       this._onKeyUp, false);
    }

    onContextMenu( event ) {
        event.preventDefault();
    }

    onMouseDown( event ) {
        //console.log("MultiControls.onMouseDown button:" +event.button);
        if ( this.domElement !== document ) {
            this.domElement.focus();
        }
        event.preventDefault();
        //event.stopPropagation();
        this.whichButton = event.button;
        this.mouseDragOn = true;
        this.mousePtDown = this.getMousePt(event);
        this.anglesDown = this.getCamAngles();
        this.camPosDown = this.game.camera.position.clone();
        this.getTarget();
    };

    onMouseUp( event ) {
        //console.log("MultiControls.onMouseUp");
        event.preventDefault();
        //event.stopPropagation();
        this.mouseDragOn = false;
    };

    onMouseClick( event ) {
        this.handleRaycast(event);
        var obj = this.pickedObj;
        console.log("click", obj);
        if (!obj)
            return;
        if (obj.name && obj.name.startsWith("vidBub")) {
            var position = obj.getWorldPosition();
            console.log("************* pos: ",position);
            var rotation = new THREE.Euler(0,0,0);
            var view = {position, rotation};
            this.prevView = this.game.viewManager.getCurrentView();
            this.game.viewManager.goto(view, 2);
        }
    }

    onMouseWheel(evt) {
        //console.log("LookControls.onMouseWheel...");
        evt.preventDefault();
        if (evt.shiftKey)
            this.handleChangeFOV(evt);
        else
            this.handleDolly(evt);
    }

    onMouseMove( event ) {
        this.handleRaycast(event);
        if (!this.mouseDragOn || !this.enabled)
            return;
        //console.log("MultiControls.onMouseMove");
        var pt = this.getMousePt(event);
        var dx = pt.x - this.mousePtDown.x;
        var dy = pt.y - this.mousePtDown.y;
        //console.log("MultiControls.onMouseMove button:" +event.button+"  dx: "+dx+"  dy: "+dy);
        if (event.shiftKey || this.whichButton == 2) {
            this.handlePan(dx,dy);
            return;
        }
        if (this.whichButton == 0) {
            this.handleLook(dx,dy);
        }
        if (this.whichButton == 1) {
            this.handleOrbit(dx,dy);
        }
    }

    getMousePt(event)
    {
        return {x: event.pageX, y: event.pageY };
    }

    handleChangeFOV(evt)
    {
        var sf = 0.015;
        var camera = this.game.camera;
        if (evt.wheelDeltaY) { // WebKit
            camera.fov -= evt.wheelDeltaY * sf;
        } else if (evt.wheelDelta) {    // Opera / IE9
            camera.fov -= evt.wheelDelta * sf;
        } else if (evt.detail) { // Firefox
            camera.fov += evt.detail * 1.0;
        }
        //camera.fov = Math.max(20, Math.min(100, camera.fov));
        camera.fov = Math.max(10, Math.min(140, camera.fov));
        camera.updateProjectionMatrix();
    }

    handleDolly(evt)
    {
        var sf = 0.015;
        var dx = 0;
        var camera = this.game.camera;
        if (evt.wheelDeltaY) { // WebKit
            dx -= evt.wheelDeltaY * sf;
        } else if (evt.wheelDelta) {    // Opera / IE9
            dx -= evt.wheelDelta * sf;
        } else if (evt.detail) { // Firefox
            dx += evt.detail * 1.0;
        }
        //console.log(sprintf("handleDolly dx: %f", dx));
        this.dolly(dx);
    }

    dolly(dx) {
        this.getTarget();
        var cam = this.game.camera;
        var camPos = cam.position;
        var d = camPos.distanceTo(this.target);
        //console.log(sprintf("dolly dx: %f", dx));
        //var wv = cam.getWorldDirection();
        var wv = this.getCamForward();
        var ds = dx < 0 ? 0.1*d : -0.1*d;
        camPos.addScaledVector(wv, ds);
    }

    handleRaycast(event) {
        var x = (event.pageX / window.innerWidth)*2 - 1;
        var y = - (event.pageY / window.innerHeight)*2 + 1;
        return this.raycast(x,y);
    }

    raycast(x,y)
    {
        //console.log("raycast "+x+" "+y);
        this.raycastPt.x = x;
        this.raycastPt.y = y;
        this.raycaster.setFromCamera(this.raycastPt, this.game.camera);
        var objs = this.game.scene.children;
        var intersects = this.raycaster.intersectObjects(objs, true);
        //var i = 0;
        if (intersects.length == 0)
            return null;
        this.pickedName = "";
        this.pickedObj = null;
        this.pickedIsect = null;
        var inst = this;
        for (var i=0; i<intersects.length; i++) {
            //intersects.forEach(isect => {
            //i++;
            var isect = intersects[i];
            var obj = isect.object;
            if (this.ignoredModels.includes(obj.name))
                continue;
            inst.pickedObj = obj;
            inst.pickedName = obj.name;
            inst.pickedIsect = isect;
            break;
            //console.log("isect "+i+" "+obj.name);
        }
        this.game.setStatus(this.pickedName);
        /*
          if (intersects.length > 0) {
          var isect = intersects[0];
          if (isect.object.name != "Stars")
          return isect;
          }
        */
        return this.pickedIsect;
    }

    handleLook(dx, dy)
    {
        //console.log("MultiControls.handleLook dx: "+dx+"  dy: "+dy);
        dx *= this.lookSense;
        dy *= this.lookSense;
        var theta = this.anglesDown.theta - this.panRatio * dx;
        var phi =   this.anglesDown.phi + this.pitchRatio * dy;
        this.setCamAngles(theta, phi);
    }

    handleOrbit(dx, dy)
    {
        //console.log("MultiControls.handleOrbit dx: "+dx+"  dy: "+dy);
        var camPos = this.object.position;
        var d = camPos.distanceTo(this.target);
        //console.log("Target:", this.target);
        //console.log("Cam Pos:", camPos);
        //console.log("d: "+d);
        var theta = this.anglesDown.theta - this.panRatio   * dx;
        var phi =   this.anglesDown.phi   + this.pitchRatio * dy;
        camPos.subVectors(this.target, this.getVec(theta, phi, d));
        this.object.lookAt( this.target );
    }

    handlePan(dx, dy)
    {
        var camPos = this.object.position;
        var f = 0.05;
        var dV = new THREE.Vector3();
        var vRight = this.getCamRight();
        var vUp = this.getCamUp();
        //console.log("pan vRight: ", vRight);
        //console.log("pan    vUp: ", vUp);
        dV.addScaledVector(vRight, -f*dx);
        dV.addScaledVector(vUp, f*dy);
        //console.log("pan     dV:", dV);
        camPos.addVectors(this.camPosDown, dV);
    }

    onKeyDown( event ) {
        var kc = event.keyCode;
        console.log("onKeyDown "+kc);
        //event.preventDefault();
        switch ( event.keyCode ) {

        case KEYS.W:
            this.speedForward = 1;
            break;

        case KEYS.S:
            this.speedForward = -1;
            break;

        case KEYS.A:
            if (event.shiftKey){
                this.speedRight = -1;
            }else{
                this.speedRotateY = 1;
            }
            break;

        case KEYS.D:
            if(event.shiftKey){
                this.speedRight = 1;
            }else{
                this.speedRotateY = -1;
            }
            break;

        case KEYS.UP:
            this.speedForward = 1;
            break;

        case KEYS.BOTTOM:
            this.speedForward = -1;
            break;

        case KEYS.LEFT:
            if (event.shiftKey){
                this.speedRight = -1;
            }else{
                this.speedRotateY = 1;
            }
            break;

        case KEYS.RIGHT:
        if (event.shiftKey){
            this.speedRight = 1;
        }else{
            this.speedRotateY = -1;
        }
            break;

        case KEYS.B:
            if (this.prevView) {
                this.game.viewManager.goto(this.prevView, 2);
            }
            break;
        }
    };

    onKeyUp( event ) {
        var kc = event.keyCode;
        console.log("onKeyUp "+kc);
        switch ( event.keyCode ){

        case KEYS.W:
            this.speedForward = 0;
            break;

        case KEYS.S:
            this.speedForward = 0;
            break;

        case KEYS.A:
                this.speedRight = 0;
                this.speedRotateY = 0;
            break;

        case KEYS.D:
                this.speedRight = 0;
                this.speedRotateY = 0;
            break;

        case KEYS.UP:
            this.speedForward = 0;
            break;

        case KEYS.BOTTOM:
            this.speedForward = 0;
            break;

        case KEYS.LEFT:
                this.speedRight = 0;
                this.speedRotateY = 0;
            break;

        case KEYS.RIGHT:
            this.speedRight = 0;
            this.speedRotateY = 0;
            break;
        }
    };

    update()
    {
        var cam = this.game.camera;
        if (this.speedForward) {
            var camPos = cam.position;
            var v = this.getCamForward();
            var ds = 0.06*this.speedForward;
            camPos.addScaledVector(v, ds);
        }
        if (this.speedRight) {
            var camPos = cam.position;
            var v = this.getCamRight();
            var ds = 0.06*this.speedRight;
            camPos.addScaledVector(v, ds);
        }
        if (this.speedRotateY) {
            var ds = this.keyPanSpeed*this.speedRotateY;
            this.object.rotateY(ds);
        }
    }

    // This tries to find an appropriate target for trackballing
    // The first choice is the intersect with geometry direction
    // inline with camera center.  If there is none, a point 100
    // units in front of camera is used.
    getTarget()
    {
        //console.log("getTarget");
        var isect = this.raycast(0,0);
        if (isect) {
            console.log("setting target from intersect");
            this.target = isect.point.clone();
        }
        else {
            console.log("setting target without intersect");
            var cam = this.game.camera;
            //var wv = cam.getWorldDirection();
            var wv = this.getCamForward();
            var d = 100;
            this.target = cam.position.clone();
            this.target.addScaledVector(wv, d);
        }
        //console.log("Target:", this.target);
    }

    getCamAngles()
    {
        //var cam = this.game.camera;
        //var wv = cam.getWorldDirection();
        var wv = this.getCamForward();
        var sp = new THREE.Spherical();
        sp.setFromVector3(wv);
        return {theta: sp.theta, phi: sp.phi};
    }

    setCamAngles(theta, phi) {
        var targetPos = new THREE.Vector3();
        targetPos.addVectors(this.object.position, this.getVec(theta, phi));
        this.object.lookAt( targetPos );
    };

    // Get camera forward direction (direction it is looking)
    // in world coordinates.
    getCamForward()
    {
        return this.game.camera.getWorldDirection();
        /*
          var cam = this.game.camera;
          var vL = new THREE.Vector3(0,0,-1);
          var vW = vL.applyMatrix4(cam.matrixWorld);
          vW.sub(cam.position).normalize();
          return vW;
        */
    }

    getCamRight()
    {
        var cam = this.game.camera;
        cam.updateMatrixWorld();
        var vRightLocal = new THREE.Vector3(1,0,0);
        var vRightWorld = vRightLocal.applyMatrix4(cam.matrixWorld);
        vRightWorld.sub(cam.position).normalize();
        return vRightWorld;
    }

    getCamUp()
    {
        var cam = this.game.camera;
        cam.updateMatrixWorld();
        var vUpLocal = new THREE.Vector3(0,1,0);
        var vUpWorld = vUpLocal.applyMatrix4(cam.matrixWorld);
        vUpWorld.sub(cam.position).normalize();
        return vUpWorld;
    }

    // Return vector of given length in direction specified
    // by spherical coordinates theta,phi.
    getVec(theta, phi, d)
    {
        d = d || 1.0;
        theta = Math.PI/2 - theta;
        var v = new THREE.Vector3();
        v.x = d * Math.sin( phi ) * Math.cos( theta );
        v.y = d * Math.cos( phi );
        v.z = d * Math.sin( phi ) * Math.sin( theta );
        return v;
    }

    dispose() {
        this.domElement.removeEventListener( 'contextmenu', this.contextmenu, false );
        this.domElement.removeEventListener( 'mousedown',   this._onMouseDown, false );
        this.domElement.removeEventListener( 'mousemove',   this._onMouseMove, false );
        this.domElement.removeEventListener( 'mouseup',     this._onMouseUp, false );
        this.domElement.removeEventListener( 'contextmenu', this._onContextMenu, false );
        window.removeEventListener( 'keydown',              this._onKeyDown, false );
        window.removeEventListener( 'keyup',                this._onKeyUp, false );
    };

};

export {JoelControls};