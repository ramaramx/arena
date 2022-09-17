/*global THREE, AFRAME */

const COMPONENT_SUFFIX = '-controls',
    MAX_DELTA = 0.2, // ms
    EPS = 10e-6;

AFRAME.registerComponent('movement-controls-c', {

  /*******************************************************************
   * Schema
   */

  dependencies: ['rotation'],

  schema: {
    enabled:            { default: true },
    controls:           { default: ['gamepad', 'trackpad', 'keyboard', 'touch'] },
    speed:              { default: 0.3, min: 0 },
    fly:                { default: false },
    constrainToNavMesh: { default: false },
    camera:             { default: '[movement-controls] [camera]', type: 'selector' },
    
    // custom contraints; ring style faux navmesh
    constrainToRing:    { default: true },
    ringInnerRadius:    { default: .4 },
    ringOuterRadius:    { default: 4.25 },
    ringCenter:         { default: {x:0,y:0,z:0}, type: "vec3"},
  },

  /*******************************************************************
   * Lifecycle
   */
  ringCenter: new THREE.Vector3(),
  cameraWorldVector: new THREE.Vector3(),
  isInRing(nextPosition) {
    // this.el.object3D.getWorldPosition(this.cameraWorldVector);
    let ringDistance = nextPosition.distanceTo(this.ringCenter);
    // console.log("ring distance would be", ringDistance, this.data.ringInnerRadius, this.data.ringOuterRadius, ringDistance > this.data.ringInnerRadius, ringDistance < this.data.ringOuterRadius)
    return ringDistance > this.data.ringInnerRadius && ringDistance < this.data.ringOuterRadius;
  },

  init: function () {
    const el = this.el;
    if (!this.data.camera) {
      this.data.camera = el.querySelector('[camera]')
    }
    this.velocityCtrl = null;

    this.velocity = new THREE.Vector3();
    this.heading = new THREE.Quaternion();

    // Navigation
    this.navGroup = null;
    this.navNode = null;

    if (el.sceneEl.hasLoaded) {
      this.injectControls();
    } else {
      el.sceneEl.addEventListener('loaded', this.injectControls.bind(this));
    }
  },

  update: function (prevData) {
    const el = this.el;
    const data = this.data;
    const nav = el.sceneEl.systems.nav;
    if (el.sceneEl.hasLoaded) {
      this.injectControls();
    }
    if (nav && data.constrainToNavMesh !== prevData.constrainToNavMesh) {
      data.constrainToNavMesh
        ? nav.addAgent(this)
        : nav.removeAgent(this);
    }
    if (data.ringCenter !== prevData.ringCenter) {
      // console.log("setting ring center")
      this.ringCenter = new THREE.Vector3(data.ringCenter.x, data.ringCenter.y, data.ringCenter.z);
      console.log(this.ringCenter)
    }
  },

  injectControls: function () {
    const data = this.data;
    var name;

    for (let i = 0; i < data.controls.length; i++) {
      name = data.controls[i] + COMPONENT_SUFFIX;
      if (!this.el.components[name]) {
        this.el.setAttribute(name, '');
      }
    }
  },

  updateNavLocation: function () {
    this.navGroup = null;
    this.navNode = null;
  },

  /*******************************************************************
   * Tick
   */

  nextPos: new THREE.Vector3(),
  tick: (function () {
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const clampedEnd = new THREE.Vector3();

    return function (t, dt) {
      if (!dt) return;

      const el = this.el;
      const data = this.data;

      if (!data.enabled) return;

      this.updateVelocityCtrl();
      const velocityCtrl = this.velocityCtrl;
      const velocity = this.velocity;

      if (!velocityCtrl) return;

      // Update velocity. If FPS is too low, reset.
      if (dt / 1000 > MAX_DELTA) {
        velocity.set(0, 0, 0);
      } else {
        this.updateVelocity(dt);
      }

      if (this.data.constrainToRing) {
        this.nextPos.x = el.object3D.position.x + velocity.x * dt / 1000;
        this.nextPos.y = el.object3D.position.y + velocity.y * dt / 1000;
        this.nextPos.z = el.object3D.position.z + velocity.z * dt / 1000;
        if (this.isInRing(this.nextPos)) {
          // console.log("is in ring, moving")
          el.object3D.position.x = this.nextPos.x;
          el.object3D.position.y = this.nextPos.y;
          el.object3D.position.z = this.nextPos.z;
        }
        else {
          // console.warn("not in ring, ignoring movement command", el.object3D.position, this.nextPos)
        }
      }
      else if (data.constrainToNavMesh
          && velocityCtrl.isNavMeshConstrained !== false) {

        if (velocity.lengthSq() < EPS) return;

        start.copy(el.object3D.position);
        end
          .copy(velocity)
          .multiplyScalar(dt / 1000)
          .add(start);

        const nav = el.sceneEl.systems.nav;
        this.navGroup = this.navGroup === null ? nav.getGroup(start) : this.navGroup;
        this.navNode = this.navNode || nav.getNode(start, this.navGroup);
        this.navNode = nav.clampStep(start, end, this.navGroup, this.navNode, clampedEnd);
        el.object3D.position.copy(clampedEnd);
      } else if (el.hasAttribute('velocity')) {
        el.setAttribute('velocity', velocity);
      } else {
        el.object3D.position.x += velocity.x * dt / 1000;
        el.object3D.position.y += velocity.y * dt / 1000;
        el.object3D.position.z += velocity.z * dt / 1000;
      }

    };
  }()),

  /*******************************************************************
   * Movement
   */

  updateVelocityCtrl: function () {
    const data = this.data;
    if (data.enabled) {
      for (let i = 0, l = data.controls.length; i < l; i++) {
        const control = this.el.components[data.controls[i] + COMPONENT_SUFFIX];
        if (control && control.isVelocityActive()) {
          this.velocityCtrl = control;
          return;
        }
      }
      this.velocityCtrl = null;
    }
  },

  updateVelocity: (function () {
    const vector2 = new THREE.Vector2();
    const quaternion = new THREE.Quaternion();

    return function (dt) {
      let dVelocity;
      const el = this.el;
      const control = this.velocityCtrl;
      const velocity = this.velocity;
      const data = this.data;

      if (control) {
        if (control.getVelocityDelta) {
          dVelocity = control.getVelocityDelta(dt);
        } else if (control.getVelocity) {
          velocity.copy(control.getVelocity());
          return;
        } else if (control.getPositionDelta) {
          velocity.copy(control.getPositionDelta(dt).multiplyScalar(1000 / dt));
          return;
        } else {
          throw new Error('Incompatible movement controls: ', control);
        }
      }

      if (el.hasAttribute('velocity') && !data.constrainToNavMesh) {
        velocity.copy(this.el.getAttribute('velocity'));
      }

      if (dVelocity && data.enabled) {
        const cameraEl = data.camera;

        // Rotate to heading
        quaternion.copy(cameraEl.object3D.quaternion);
        quaternion.premultiply(el.object3D.quaternion);
        dVelocity.applyQuaternion(quaternion);

        const factor = dVelocity.length();
        if (data.fly) {
          velocity.copy(dVelocity);
          velocity.multiplyScalar(this.data.speed * 16.66667);
        } else {
          vector2.set(dVelocity.x, dVelocity.z);
          vector2.setLength(factor * this.data.speed * 16.66667);
          velocity.x = vector2.x;
          velocity.z = vector2.y;
        }
      }
    };

  }())
});