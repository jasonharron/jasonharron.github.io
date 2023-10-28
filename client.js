import * as THREE from "three";

import { BoxLineGeometry } from "three/addons/geometries/BoxLineGeometry.js";
import { XRButton } from "three/addons/webxr/XRButton.js";
import { ARButton } from "./ARButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, Object3D } from "three";

let enablePhysics = true;

let camera, scene, renderer;
let controller1, controller2;
let controllerGrip1, controllerGrip2;

let room, spheres;
let physics,
  velocity = new THREE.Vector3();
let ar;
let vr;

/////////////////
//   Rapier   //
////////////////
//const RAPIER_PATH = "https://cdn.skypack.dev/@dimforge/rapier3d-compat@0.11.2";
//NOTE: Alternative path to Rapier Physics min file
const RAPIER_PATH =
  "https://cdn.skypack.dev/pin/@dimforge/rapier3d-compat@v0.11.2-2ynsEzwjLv57bqvhulDB/mode=imports,min/optimized/@dimforge/rapier3d-compat.js";

const frameRate = 90;

const _scale = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Vector3();

let RAPIER = null;

const meshes = [];
const meshMap = new WeakMap();

////////////////////

let userArray = [];

let count = 0;
let frameCount = 0;
let pressCount = 0;
let presenting = 0;
let cubeGroup;
let controllerGroup;
let controller;

let reticle;

let hitTestSource = null;
let hitTestSourceRequested = false;

let planes;
let planesAdded = 0;

let planesGeometry = [];
let planesMaterial = [];

let roomArray = [];

let lineGroup = new THREE.Group();
lineGroup.name = "Line Group";
let meshGroup = new THREE.Group();
meshGroup.name = "Mesh Group";
let planeGroup = new THREE.Group();
planeGroup.name = "Plane Group";
let occlusionGroup = new THREE.Group();
occlusionGroup.name = "Occlusion Group";

////////////////////////////////////////
//// MODIFICATIONS FROM THREEJS EXAMPLE
//// a camera dolly to move camera within webXR
//// a vector to reuse each frame to store webXR camera heading
//// a variable to store previous frames polling of gamepads
//// a variable to store accumulated accelerations along axis with continuous movement

var dolly;
var cameraVector = new THREE.Vector3(); // create once and reuse it!
const prevGamePads = new Map();
var speedFactor = [0.0001, 0.0001, 0.0001, 0.0001];
let controls;
let calibrationMode = 0;
let baseReferenceSpace;
let originReferenceSpace;
let myRot = new THREE.Vector3();
let myPos = new THREE.Vector3();
//let compassdir;

/////////////////////
// Mesh-detection //
///////////////////

const allMeshOrigins = [];
const meshMaterials = [];
const wireframeMaterial = new THREE.MeshBasicMaterial({
  wireframe: true,
});
const baseOriginGroup = new THREE.Group();

let meshId = 1;
let allMeshes = new Map();

class XRPlanes extends Object3D {
  constructor(renderer) {
    super();

    const matrix = new Matrix4();

    const currentPlanes = new Map();

    const xr = renderer.xr;

    xr.addEventListener("planesdetected", (event) => {
      const frame = event.data;
      const planes = frame.detectedPlanes;

      const referenceSpace = xr.getReferenceSpace();

      let planeschanged = false;

      for (const [plane, mesh] of currentPlanes) {
        if (planes.has(plane) === false) {
          mesh.geometry.dispose();
          mesh.material.dispose();
          this.remove(mesh);

          currentPlanes.delete(plane);

          planeschanged = true;
        }
      }

      for (const plane of planes) {
        if (currentPlanes.has(plane) === false) {
          const pose = frame.getPose(plane.planeSpace, referenceSpace);
          matrix.fromArray(pose.transform.matrix);

          const polygon = plane.polygon;

          let minX = Number.MAX_SAFE_INTEGER;
          let maxX = Number.MIN_SAFE_INTEGER;
          let minZ = Number.MAX_SAFE_INTEGER;
          let maxZ = Number.MIN_SAFE_INTEGER;

          for (const point of polygon) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minZ = Math.min(minZ, point.z);
            maxZ = Math.max(maxZ, point.z);
          }

          const width = maxX - minX;
          const height = maxZ - minZ;

          const geometry = new THREE.BoxGeometry(width, 0.0001, height);
          const material = new THREE.MeshLambertMaterial({
            color: 0x75d2e0, //0xffffff * Math.random(),
            transparent: true,
            opacity: 0.2,
            //wireframe: true,
            //wireframeLinewidth: 3,
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.setFromMatrixPosition(matrix);
          mesh.quaternion.setFromRotationMatrix(matrix);
          mesh.name = "Plane";
          planeGroup.add(mesh);

          var centerMesh = getCenterPoint(mesh);

          const edges = new THREE.EdgesGeometry(geometry);
          const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 })
          );
          line.position.setFromMatrixPosition(matrix);
          line.quaternion.setFromRotationMatrix(mesh.matrix);
          line.updateMatrix();
          lineGroup.add(line);

          const geometryPhysics = new THREE.BoxGeometry(
            width,
            0.05,
            height
          ).translate(0, 0.1, 0);
          const meshPhysics = new THREE.Mesh(geometryPhysics, material);
          meshPhysics.position.setFromMatrixPosition(matrix);
          meshPhysics.quaternion.setFromRotationMatrix(matrix);
          //scene.add(meshPhysics);
          physics.addMesh(meshPhysics);

          currentPlanes.set(plane, mesh);

          planeschanged = true;
        }
      }

      if (planeschanged) {
        this.dispatchEvent({ type: "planeschanged" });
      }
    });
  }
}

init();
await initPhysics();

///////////////////////////////
//  Start init() for scene  //
/////////////////////////////

function init() {
  let userArrayFromServer = {
    id: "12345",
    color: 0,
    presenting: 0,
    ar: 0,
    vr: 0,
    xr: 0,
    controllerNum: 0,
    con1: 0,
    con2: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
  }
      userArray.push(userArrayFromServer);
    if (userArray.length === 1) {
      checkForXR();
    }
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x505050);

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );
  camera.position.set(0, 30, 0);
  camera.lookAt(0, 0, 0);

  room = new THREE.LineSegments(
    new BoxLineGeometry(6, 6, 6, 10, 10, 10),
    new THREE.LineBasicMaterial({ color: 0x808080, linewidth: 3 })
  );
  room.geometry.translate(0, 3, 0);
  //scene.add(room);
  const hemLight = new THREE.HemisphereLight(0xbbbbbb, 0x888888, 5);
  hemLight.name = "Hemisphere Light";
  scene.add(hemLight);

  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(1, 1, 1).normalize();
  light.name = "Directional Light";
  scene.add(light);

  // Alternatively, to parse a previously loaded JSON structure
  //const object = loader.parse(a_json_object);

  //scene.add(lineGroup);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(render);
  renderer.useLegacyLights = false;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  document.body.appendChild(renderer.domElement);

  renderer.xr.addEventListener("sessionstart", function (event) {
    baseReferenceSpace = renderer.xr.getReferenceSpace();
    addLocalClientToVR();
    planes = new XRPlanes(renderer);
    planeGroup.add(planes);
    //physics.addMesh(controllerGrip1);
    //physics.addMesh(controllerGrip2);
  });

  //

  controls = new OrbitControls(camera, renderer.domElement);
  controls.maxDistance = 10;
  controls.target.y = 1.6;
  controls.update();

  const geometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 32).translate(
    0,
    0.1,
    0
  );
  function onSelect() {
    if (reticle.visible) {
      const material = new THREE.MeshPhongMaterial({
        color: 0xffffff * Math.random(),
      });
      const mesh = new THREE.Mesh(geometry, material);
      reticle.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.scale.y = Math.random() * 2 + 1;
      //scene.add(mesh);
    }
  }

  controller = renderer.xr.getController(0);
  controller.addEventListener("select", onSelect);
  scene.add(controller);

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // controllers

  function onSelectStart() {
    this.userData.isSelecting = true;
  }

  function onSelectEnd() {
    this.userData.isSelecting = false;
  }

  function onSqueezeStartLeft() {
    this.userData.isSqueezing = true;
  }

  function onSqueezeEndLeft() {
    this.userData.isSqueezing = false;
  }

  function onSqueezeStartRight() {
    this.userData.isSqueezing = true;
  }

  function onSqueezeEndRight() {
    this.userData.isSqueezing = false;
  }

  controller1 = renderer.xr.getController(0);
  controller1.name = "left";
  controller1.addEventListener("selectstart", onSelectStart);
  controller1.addEventListener("selectend", onSelectEnd);
  controller1.addEventListener("squeezestart", onSqueezeStartLeft);
  controller1.addEventListener("squeezeend", onSqueezeEndLeft);
  controller1.addEventListener("connected", function (event) {
    this.add(buildController(event.data));
  });
  controller1.addEventListener("disconnected", function () {
    this.remove(this.children[0]);
  });
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller1.name = "right";
  controller2.addEventListener("selectstart", onSelectStart);
  controller2.addEventListener("selectend", onSelectEnd);
  controller2.addEventListener("squeezestart", onSqueezeStartRight);
  controller2.addEventListener("squeezeend", onSqueezeEndRight);
  controller2.addEventListener("connected", function (event) {
    this.add(buildController(event.data));
  });
  controller2.addEventListener("disconnected", function () {
    this.remove(this.children[0]);
  });
  scene.add(controller2);

  // The XRControllerModelFactory will automatically fetch controller models
  // that match what the user is holding as closely as possible. The models
  // should be attached to the object returned from getControllerGrip in
  // order to match the orientation of the held device.

  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(
    controllerModelFactory.createControllerModel(controllerGrip1)
  );
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(
    controllerModelFactory.createControllerModel(controllerGrip2)
  );
  scene.add(controllerGrip2);

  scene.add(meshGroup);
  scene.add(planeGroup);
  scene.add(lineGroup);
  scene.add(occlusionGroup);
  
  

  // Mesh-detection
  updateState();

  window.addEventListener("keydown", (event) => {
    saveScene(event);
  });

  window.addEventListener("resize", onWindowResize);
}

///////////////////////////
//  Initialize Physics  //
/////////////////////////

async function initPhysics() {
  physics = await RapierPhysics();

  {

    const geometry = new THREE.BoxGeometry(6, 2, 6);
    const material = new THREE.MeshNormalMaterial();

    const floor = new THREE.Mesh(geometry, material);
    floor.position.y = -1;
    //physics.addMesh(floor);

    // Walls

    const wallPX = new THREE.Mesh(geometry, material);
    wallPX.position.set(4, 3, 0);
    wallPX.rotation.z = Math.PI / 2;
    //physics.addMesh(wallPX);

    const wallNX = new THREE.Mesh(geometry, material);
    wallNX.position.set(-4, 3, 0);
    wallNX.rotation.z = Math.PI / 2;
    //physics.addMesh(wallNX);

    const wallPZ = new THREE.Mesh(geometry, material);
    wallPZ.position.set(0, 3, 4);
    wallPZ.rotation.x = Math.PI / 2;
    //physics.addMesh(wallPZ);

    const wallNZ = new THREE.Mesh(geometry, material);
    wallNZ.position.set(0, 3, -4);
    wallNZ.rotation.x = Math.PI / 2;
    //physics.addMesh(wallNZ);
  }

  // Spheres

  const geometry = new THREE.IcosahedronGeometry(0.05, 3);
  const material = new THREE.MeshLambertMaterial();

  spheres = new THREE.InstancedMesh(geometry, material, 100);
  spheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // will be updated every frame
  spheres.renderOrder = 1;
  scene.add(spheres);

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  for (let i = 0; i < spheres.count; i++) {
    const x = Math.random() * 4 - 2;
    const y = Math.random() * 4;
    const z = Math.random() * 4 - 2;

    matrix.setPosition(x, y, z);
    spheres.setMatrixAt(i, matrix);
    var ballColor = i % 3;
    if (ballColor == 0) {
      spheres.setColorAt(i, color.setHex(0xb0b3b2));
    } else if (ballColor == 1) {
      spheres.setColorAt(i, color.setHex(0x231f20));
    } else if (ballColor == 2) {
      spheres.setColorAt(i, color.setHex(0xeec629));
    }
  }

  physics.addMesh(spheres, 1, 1.1);

}

/////////////////
// Functions  //
///////////////

function addLocalClientToVR() {
  userArray[0].color = randomColor(); //calls randomColor() function
  var data = userArray[0]; //sets data as userArray[0] (the local client)

  // Checks is user is a vr headset to add controllers
  if (userArray[0].vr === 1) {
    var con1Name = "controller1";
    var con2Name = "controller2";
    var userID = userArray[0].id;
    var cubeCon1Name = userID.concat(con1Name);
    var cubeCon2Name = userID.concat(con2Name);
    var data1 = controllerConstructor(
      cubeCon1Name,
      userArray[0].color,
      1,
      1,
      0
    );
    var data2 = controllerConstructor(
      cubeCon2Name,
      userArray[0].color,
      2,
      0,
      1
    );

    userArray[0].con1 = 1;
    userArray[0].con2 = 1;
  }
}

function addCube(data) {
  let inArray = getIndexByID(data);
  if (inArray < 0) {
    userArray.push(data);
  }

  const geometry = new THREE.BoxGeometry(0.6, 1, 0.15);
  const material = new THREE.MeshLambertMaterial({
    color: data.color,
    transparent: true,
    opacity: 0.85,
  });

  var cube = new THREE.Mesh(geometry, material);
  var name = data.id;
  cube.name = name;
  cube.position.set(0, 0, 0);
  scene.add(cube);

  var i = getIndexByID(data);
  userArray[i] = data;
  userArray[i].presenting = 1;
}

function addCubeController(data) {
  //userArray.push(data);
  const geometry = new THREE.BoxGeometry(0.08, 0.15, 0.08);
  const material = new THREE.MeshLambertMaterial({
    color: data.color,
    transparent: true,
    opacity: 0.85,
  });

  var cube = new THREE.Mesh(geometry, material);
  var name = data.id;
  cube.name = name;
  cube.position.set(0, 0, 0);
  scene.add(cube);
}

function buildController(data) {
  let geometry, material;

  switch (data.targetRayMode) {
    case "tracked-pointer":
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3)
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3)
      );

      material = new THREE.LineBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
      });

      return new THREE.Line(geometry, material);

    case "gaze":
      geometry = new THREE.RingGeometry(0.02, 0.04, 32).translate(0, 0, -1);
      material = new THREE.MeshBasicMaterial({
        opacity: 0.5,
        transparent: true,
      });
      return new THREE.Mesh(geometry, material);
  }
}

function controllerConstructor(conName, color, conNum, con1, con2) {
  var conJSON = {
    id: conName,
    color: color,
    presenting: 1,
    ar: 0,
    vr: 1,
    xr: 0,
    controllerNum: conNum,
    con1: con1,
    con2: con2,
    posX: 0,
    posY: 0,
    posZ: 0,
  };
  return conJSON;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

//getCenterPoint(mesh) - Finds the center point of a mesh from its geometry
//                       Used to convert the bufferGeometry bounding box to a
//                       BoxGeometry with correct center for Rapier Physics.
function getCenterPoint(mesh) {
  var geometry = mesh.geometry;
  geometry.computeBoundingBox();
  var center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  mesh.localToWorld(center);
  return center;
}

function getIndexByID(data) {
  for (let i in userArray) {
    if (userArray[i].id == data.id) {
      return i;
    }
  }
}

function handleController(controller) {
  if (controller.userData.isSelecting) {
    pressCount = pressCount + 1;
    if (renderer.xr.isPresenting && pressCount >= 1) {
      pressCount = 0;
      var controllerOffset = controller.position;

      //Temporary work around for iOS
      if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        controllerOffset.y = controllerOffset.y - 1.6;
      }
      physics.setMeshPosition(spheres, controllerOffset, count);
      velocity.x = (Math.random() - 0.5) * 2;
      velocity.y = (Math.random() - 0.5) * 2;
      velocity.z = Math.random() - 9;
      velocity.applyQuaternion(controller.quaternion);

      physics.setMeshVelocity(spheres, velocity, count);

    } else if (pressCount >= 1) {
      pressCount = 0;

      var controllerOffset = controller.position;
      // controllerOffset.y = controllerOffset.y - 0.5;
      physics.setMeshPosition(spheres, controllerOffset, count);
      velocity.x = (Math.random() - 0.5) * 2;
      velocity.y = (Math.random() - 0.5) * 2;
      velocity.z = Math.random() - 9;
      velocity.applyQuaternion(controller.quaternion);

      physics.setMeshVelocity(spheres, velocity, count);

    }
    if (++count === spheres.count) {
      count = 0;
    }
  }
  if (controller1.userData.isSqueezing) {
    //scene.rotation.y += 0.0005;
  }

  if (controller2.userData.isSqueezing) {
    //scene.rotation.y += 0.0005;
  }
}

function updateMyCube() {
  var cube = scene.getObjectByName(userArray[0].id);
  if (cube !== undefined) {
    var XRCamera = renderer.xr.getCamera();
    console.log(cube);
    if (cube.name == userArray[0].id) {
      cube.position.x = XRCamera.position.x;
      cube.position.y = XRCamera.position.y;
      cube.position.z = XRCamera.position.z;
      cube.setRotationFromEuler(XRCamera.rotation);
    }
  }
}

function render(timestamp, frame) {
  /*
  let inputSource = primaryInputSource;

  // Check to see if the input source has gamepad data.
  if (inputSource && inputSource.gamepad) {
    let gamepad = inputSource.gamepad;

    // Use touchpad values for movement.
    //if (gamepad.axes.length >= 2) {
    //  MoveUser(gamepad.axes[0], gamepad.axes[1]);
    // }

    // If the first gamepad button is pressed, perform an action.
    if (gamepad.buttons.length >= 1 && gamepad.buttons[0].pressed) {
      scene.rotation.y += 0.0005;
    }

    // etc.
  }
  */

  // Do the rest of typical frame processing...
  dollyMove();
  handleController(controller1);
  handleController(controller2);
  frameCount = frameCount + 1;
  if (frameCount >= 0 && renderer.xr.isPresenting === true) {
    // var matrix = cube.matrix;
    frameCount = 0;
    var XRCamera = renderer.xr.getCamera();
  }

  if (renderer.xr.isPresenting === true) {
    updateMyCube();
  }
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();
    processMeshes(timestamp, frame);

    if (hitTestSourceRequested === false) {
      session.requestReferenceSpace("viewer").then(function (referenceSpace) {
        session
          .requestHitTestSource({ space: referenceSpace })
          .then(function (source) {
            hitTestSource = source;
          });
      });

      session.addEventListener("end", function () {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });

      hitTestSourceRequested = true;
    }

    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length) {
        const hit = hitTestResults[0];

        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
        if (calibrationMode) {
          reticle.material.color.setHex(0xff0000);
        } else {
          reticle.material.color.setHex(0xffffff);
        }
      } else {
        reticle.visible = false;
      }
    }
  }
  renderer.render(scene, camera);

}

function randomColor() {
  const r = Math.random(),
    g = Math.random(),
    b = Math.random();
  return new THREE.Color(r, g, b);
}

function checkForXR() {
  if (window.isSecureContext === false) {
    document.body.appendChild(XRButton.createButton(renderer));
  } else if ("xr" in navigator) {
    navigator.xr
      .isSessionSupported("immersive-vr")
      .then(function (supported) {
        if (supported) {
          userArray[0].vr = 1;
          console.log("VR Supported");
          document.body.appendChild(
            ARButton.createButton(renderer, {
              requiredFeatures: [
                "hit-test",
                //"mesh-detection",
                "plane-detection",
                "local-floor",
              ],
              optionalFeatures: ["mesh-detection"],
            })
          );
        } else {
          navigator.xr
            .isSessionSupported("immersive-ar")
            .then(function (supported) {
              if (supported) {
                userArray[0].ar = 1;
                console.log("AR Supported");
                document.body.appendChild(
                  XRButton.createButton(renderer, {
                    requiredFeatures: ["hit-test", "local"],
                  })
                );
              } else {
                userArray[0].xr = 1;
                console.log("No XR Support");
                document.body.appendChild(
                  ARButton.createButton(renderer, {
                    requiredFeatures: ["hit-test", "plane-detection", "local"],
                  })
                );
              }
            })
            .catch();
        }
      })
      .catch();
  }
}

/////////////////////
// Mesh-detection //
///////////////////

//addMeshDetectionPhysics(data) - Receives a JSON from mesh-detection
//                               { bbox: geometry.boundingBox,
//                                 vertices: mesh.vertices,
//                                 indices: mesh.indices,
//                                 matrix: meshMesh.matrix,}

function addMeshDetectionPhysics(data) {
  //const geometry = new THREE.BoxGeometry(data.width, data.length, data.height);
  if (data.geometry.type == "BoxGeometry") {
    const x = data.width / 2;
    const y = data.length / 2;
    const z = data.height / 2;

    const material = new THREE.MeshLambertMaterial({
      color: 0xff0000,
      //transparent: data.transparent,
      //opacity: data.opacity,
      transparent: true,
      opacity: 0.5,
    });

    // create a buffer geometry
    const geometry = new THREE.BufferGeometry();

    // define vertices
    const vertices = new Float32Array([
      // front face
      -x,
      -y,
      z,
      x,
      -y,
      z,
      x,
      y,
      z,
      -x,
      y,
      z,
      // back face
      -x,
      -y,
      -z,
      -x,
      y,
      -z,
      x,
      y,
      -z,
      x,
      -y,
      -z,
    ]);

    // define indices
    const indices = new Uint16Array([
      0,
      1,
      2,
      0,
      2,
      3, // front face
      4,
      5,
      6,
      4,
      6,
      7, // back face
      3,
      2,
      6,
      3,
      6,
      5, // top face
      0,
      4,
      7,
      0,
      7,
      1, // bottom face
      1,
      7,
      6,
      1,
      6,
      2, // right face
      0,
      3,
      5,
      0,
      5,
      4, // left face
    ]);

    // define normals
    const normals = new Float32Array([
      // front face
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      // back face
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]);

    // add attributes to geometry
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3)); //24
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    //geometry.setDrawRange(0, 0);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.setFromMatrixPosition(data.matrix);
    mesh.quaternion.setFromRotationMatrix(data.matrix);
    mesh.name = "furniture";
    meshGroup.add(mesh);

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    line.position.setFromMatrixPosition(data.matrix);
    line.quaternion.setFromRotationMatrix(data.matrix);
    lineGroup.add(line);

    var centerMesh = getCenterPoint(mesh);

    const geometryPhysics = new THREE.BoxGeometry(
      data.width,
      data.length,
      data.height
    );

    const meshPhysics = new THREE.Mesh(geometryPhysics, material);
    meshPhysics.position.setFromMatrixPosition(data.matrix);
    meshPhysics.quaternion.setFromRotationMatrix(data.matrix);
    if (enablePhysics) {
      physics.addMesh(meshPhysics);
    }
  }
  if (data.geometry.type == "BufferGeometry") {
    const vertices = new Float32Array(data.vertices);
    const indices = new Uint32Array(data.indices);
    const geometry = createGeometry(vertices, indices);
    const material = new THREE.MeshBasicMaterial({
      //wireframe: true,
      colorWrite: false,
      renderOrder: 2,
    });
    const material2 = new THREE.MeshBasicMaterial({
      wireframe: true,
    });

    // create a buffer geometry
    const occlusionMesh = new THREE.Mesh(geometry, material);
    occlusionMesh.position.setFromMatrixPosition(data.matrix);
    occlusionMesh.quaternion.setFromRotationMatrix(data.matrix);
    const wireframeMesh = new THREE.Mesh(geometry, material2);
    wireframeMesh.position.setFromMatrixPosition(data.matrix);
    wireframeMesh.quaternion.setFromRotationMatrix(data.matrix);
    occlusionMesh.name = "Occlusion Mesh";
    occlusionGroup.add(occlusionMesh);
    wireframeMesh.name = "Wireframe Mesh";
    meshGroup.add(wireframeMesh);
    physics.addMesh(wireframeMesh);
  }
}

function createGeometry(vertices, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  return geometry;
}

function processMeshes(timestamp, frame) {
  const referenceSpace = renderer.xr.getReferenceSpace();
  if (frame.detectedMeshes) {
    allMeshes.forEach((meshContext, mesh) => {
      // if a previous mesh is no longer reported
      if (!frame.detectedMeshes.has(mesh)) {
        // mesh was removed
        allMeshes.delete(mesh);
        console.debug("Mesh no longer tracked, id=" + meshContext.id);

        scene.remove(meshContext.mesh);
        scene.remove(meshContext.wireframe);
      }
    });
    // compare all incoming meshes with our internal state
    frame.detectedMeshes.forEach((mesh) => {
      const meshPose = frame.getPose(mesh.meshSpace, referenceSpace);
      let meshMesh;
      let wireframeMesh;

      // this is a mesh we've seen before
      if (allMeshes.has(mesh)) {
        // may have been updated:
        const meshContext = allMeshes.get(mesh);
        meshMesh = meshContext.mesh;
        wireframeMesh = meshContext.wireframe;

        if (meshContext.timestamp < mesh.lastChangedTime) {
          // the mesh was updated!
          meshContext.timestamp = mesh.lastChangedTime;

          const geometry = createGeometry(mesh.vertices, mesh.indices);
          meshContext.mesh.geometry.dispose();
          meshContext.mesh.geometry = geometry;
          meshContext.wireframe.geometry.dispose();
          meshContext.wireframe.geometry = geometry;
        }
      } else {
        // new mesh

        // Create geometry:
        const geometry = createGeometry(mesh.vertices, mesh.indices);
        geometry.computeBoundingBox();

        const x = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
        const y = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
        const z = geometry.boundingBox.max.z - geometry.boundingBox.min.z;
        const geometryBoundingBox = new THREE.BoxGeometry(x, y, z);

        wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
        wireframeMesh.matrixAutoUpdate = false;
        wireframeMesh.matrix.fromArray(meshPose.transform.matrix);
        //scene.add(wireframeMesh);
        //physics.addMesh(wireframeMesh);

        meshMesh = new THREE.Mesh(
          geometry,
          meshMaterials[meshId % meshMaterials.length]
        );
        meshMesh.matrix.fromArray(meshPose.transform.matrix);

        meshMesh.matrixAutoUpdate = false;
        //scene.add(meshMesh);

        const originGroup = baseOriginGroup.clone();
        originGroup.visible = false;

        meshMesh.add(originGroup);
        allMeshOrigins.push(originGroup);

        const meshContext = {
          id: meshId,
          timestamp: mesh.lastChangedTime,
          mesh: meshMesh,
          wireframe: wireframeMesh,
          origin: originGroup,
        };

        //let pos = meshMesh.geometry.getAttribute("position");
        let pos = new THREE.Vector3();
        pos.x = meshMesh.geometry.attributes.position.array[0];
        pos.y = meshMesh.geometry.attributes.position.array[1];
        pos.z = meshMesh.geometry.attributes.position.array[2];

        //Update the matrix before sending to the server
        meshMesh.matrix.fromArray(meshPose.transform.matrix);

        const indices = new Uint32Array(mesh.indices);

        let meshDataForPhysics = {
          bbox: geometry.boundingBox,
          vertices: mesh.vertices,
          indices: mesh.indices,
          geometry: geometry,
          matrix: meshMesh.matrix,
        };

        addMeshDetectionPhysics(meshDataForPhysics);

        allMeshes.set(mesh, meshContext);
        console.debug("New mesh detected, id=" + meshId);
        meshId++;
      }

      if (meshPose) {
        meshMesh.visible = true;
        meshMesh.matrix.fromArray(meshPose.transform.matrix);
        wireframeMesh.visible = true;
        wireframeMesh.matrix.fromArray(meshPose.transform.matrix);
      } else {
        meshMesh.visible = false;
        wireframeMesh.visible = false;
      }
    });
  }
}

function updateState() {
  const createMeshMaterial = (params) =>
    new THREE.MeshBasicMaterial(
      Object.assign(params, {
        opacity: 1,
        transparent: true,
      })
    );

  meshMaterials.splice(0, meshMaterials.length);
  meshMaterials.push(createMeshMaterial({ color: 0xff0000 }));
  meshMaterials.push(createMeshMaterial({ color: 0x00ff00 }));
  meshMaterials.push(createMeshMaterial({ color: 0x0000ff }));
  meshMaterials.push(createMeshMaterial({ color: 0xffff00 }));
  meshMaterials.push(createMeshMaterial({ color: 0x00ffff }));
  meshMaterials.push(createMeshMaterial({ color: 0xff00ff }));
}

function addPlaneFromServer(data) {
  console.log("Adding plane");
  const geometry = new THREE.BoxGeometry(data.width, data.length, data.height);

  const material = new THREE.MeshLambertMaterial({
    color: data.color,
    transparent: data.transparent,
    opacity: data.opacity,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.setFromMatrixPosition(data.matrix);
  mesh.quaternion.setFromRotationMatrix(data.matrix);
  mesh.name = "Plane";
  planeGroup.add(mesh);
  console.log("Adding Plane");
  //physics.addMesh(mesh);

  var centerMesh = getCenterPoint(mesh);

  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 })
  );
  line.position.setFromMatrixPosition(data.matrix);
  line.quaternion.setFromRotationMatrix(mesh.matrix);
  line.updateMatrix();
  lineGroup.add(line);

  const geometryPhysics = new THREE.BoxGeometry(
    data.width,
    0.2,
    data.height
  ).translate(0, 0.1, 0);
  const meshPhysics = new THREE.Mesh(geometryPhysics, material);
  meshPhysics.position.setFromMatrixPosition(data.matrix);
  meshPhysics.quaternion.setFromRotationMatrix(data.matrix);
  //scene.add(meshPhysics);
  physics.addMesh(meshPhysics);
}

function dollyMove() {
  var handedness = "unknown";

  //determine if we are in an xr session
  const session = renderer.xr.getSession();
  let i = 0;

  if (session) {
    let xrCamera = renderer.xr.getCamera(camera);
    xrCamera.getWorldDirection(cameraVector);

    //a check to prevent console errors if only one input source
    if (isIterable(session.inputSources)) {
      for (const source of session.inputSources) {
        if (source && source.handedness) {
          handedness = source.handedness; //left or right controllers
        }
        if (!source.gamepad) continue;
        const controller = renderer.xr.getController(i++);
        const old = prevGamePads.get(source);
        const data = {
          handedness: handedness,
          buttons: source.gamepad.buttons.map((b) => b.value),
          axes: source.gamepad.axes.slice(0),
        };

        if (
          data.buttons[4] == 1 &&
          old.buttons[4] == 0 &&
          data.handedness == "left"
        ) {
          // calibrationMode = !calibrationMode;
          meshGroup.visible = !meshGroup.visible;
          lineGroup.visible = !lineGroup.visible;
          planeGroup.visible = !planeGroup.visible;
        }
        if (
          data.buttons[5] == 1 &&
          old.buttons[5] == 0 &&
          data.handedness == "left"
        ) {
          meshGroup.visible = true;
          lineGroup.visible = true;
          planeGroup.visible = true;
          exportScene();
        }

        if (old) {
          data.buttons.forEach((value, i) => {
            //handlers for buttons
            if (value !== old.buttons[i] || Math.abs(value) > 0.8) {
              //check if it is 'all the way pushed'
              if (value === 1) {
                //console.log("Button" + i + "Down");
                if (data.handedness == "left") {
                  //console.log("Left Paddle Down");
                  if (i == 1 && calibrationMode == 1) {
                    myRot.y = 0;
                    myRot.y += THREE.MathUtils.degToRad(0.025);
                    teleportCamera();
                  }
                  if (i == 3) {
                    //reset teleport to home position
                    //dolly.position.x = 0;
                    //dolly.position.y = 5;
                    //dolly.position.z = 0;
                  }
                } else {
                  //console.log("Right Paddle Down");
                  if (i == 1 && calibrationMode == 1) {
                    myRot.y = 0;
                    myRot.y -= THREE.MathUtils.degToRad(0.025);
                    teleportCamera();
                  }
                }
              } else {
                // console.log("Button" + i + "Up");

                if (i == 1) {
                  //use the paddle buttons to rotate
                  if (data.handedness == "left") {
                    //console.log("Left Paddle Down");
                    //dolly.rotateY(-THREE.MathUtils.degToRad(Math.abs(value)));
                  } else {
                    //console.log("Right Paddle Down");
                    //dolly.rotateY(THREE.MathUtils.degToRad(Math.abs(value)));
                  }
                }
              }
            }
          });

          data.axes.forEach((value, i) => {
            //handlers for thumbsticks
            //if thumbstick axis has moved beyond the minimum threshold from center, windows mixed reality seems to wander up to about .17 with no input
            speedFactor[i] = 0.001;
            if (Math.abs(value) > 0.2) {
              //set the speedFactor per axis, with acceleration when holding above threshold, up to a max speed
              //speedFactor[i] > 1
              //  ? (speedFactor[i] = 1)
              //  : (speedFactor[i] *= 1.001);
              //console.log(value, speedFactor[i], i);
              if (i == 2 && calibrationMode == 1) {
                //left and right axis on thumbsticks
                if (data.handedness == "left") {
                  // (data.axes[2] > 0) ? console.log('left on left thumbstick') : console.log('right on left thumbstick')

                  //move our dolly
                  //we reverse the vectors 90degrees so we can do straffing side to side movement
                  myPos.x = 0;
                  myPos.x += speedFactor[i] * data.axes[2];
                  teleportCamera();

                  //provide haptic feedback if available in browser
                  if (
                    source.gamepad.hapticActuators &&
                    source.gamepad.hapticActuators[0]
                  ) {
                    var pulseStrength = Math.abs(data.axes[2]); // + Math.abs(data.axes[3]);
                    if (pulseStrength > 0.75) {
                      pulseStrength = 0.75;
                    }

                    var didPulse = source.gamepad.hapticActuators[0].pulse(
                      pulseStrength,
                      100
                    );
                  }
                } else {
                  // (data.axes[2] > 0) ? console.log('left on right thumbstick') : console.log('right on right thumbstick')
                  //dolly.rotateY(-THREE.MathUtils.degToRad(data.axes[2]));
                  //                   dolly.position.x -=
                  //   cameraVector.x * speedFactor[i] * data.axes[2];
                  //  dolly.position.x -=
                  //    cameraVector.x * speedFactor[i] * data.axes[2];
                }
                controls.update();
              }

              if (i == 3 && calibrationMode == 1) {
                //up and down axis on thumbsticks
                if (data.handedness == "left") {
                  // (data.axes[3] > 0) ? console.log('up on left thumbstick') : console.log('down on left thumbstick')
                  // dolly.position.z += speedFactor[i] * data.axes[3];
                  //provide haptic feedback if available in browser
                  /*
                  myPos.z = 0;
                  myPos.z -= speedFactor[i] * data.axes[3];
                  teleportCamera();
                  if (
                    source.gamepad.hapticActuators &&
                    source.gamepad.hapticActuators[0]
                  ) {
                    var pulseStrength = Math.abs(data.axes[3]);
                    if (pulseStrength > 0.75) {
                      pulseStrength = 0.75;
                    }
                    var didPulse = source.gamepad.hapticActuators[0].pulse(
                      pulseStrength,
                      100
                    );
                  }
                  */
                } else {
                  myPos.z = 0;
                  myPos.z -= speedFactor[i] * data.axes[3];
                  teleportCamera();

                  //provide haptic feedback if available in browser
                  if (
                    source.gamepad.hapticActuators &&
                    source.gamepad.hapticActuators[0]
                  ) {
                    var pulseStrength =
                      Math.abs(data.axes[2]) + Math.abs(data.axes[3]);
                    if (pulseStrength > 0.75) {
                      pulseStrength = 0.75;
                    }
                    var didPulse = source.gamepad.hapticActuators[0].pulse(
                      pulseStrength,
                      100
                    );
                  }
                }
                controls.update();
              }
            } else {
              //axis below threshold - reset the speedFactor if it is greater than zero  or 0.025 but below our threshold
              if (Math.abs(value) > 0.025) {
                speedFactor[i] = 0.001;
              }
            }
          });
        }
        ///store this frames data to compate with in the next frame
        prevGamePads.set(source, data);
      }
    }
  }
}

function isIterable(obj) {
  //function to check if object is iterable
  // checks for null and undefined
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === "function";
}

function teleportCamera() {
  const offsetPosition = { x: myPos.x, y: myPos.y, z: myPos.z, w: 1 };
  const offsetRotation = { x: myRot.x, y: myRot.y, z: myRot.z, w: 1 };
  //const offsetRotationQuat = new THREE.Quaternion();
  //offsetRotationQuat.setFromEuler(offsetRotation);
  const transform = new XRRigidTransform(offsetPosition, offsetRotation);
  const teleportSpaceOffset =
    baseReferenceSpace.getOffsetReferenceSpace(transform);

  renderer.xr.setReferenceSpace(teleportSpaceOffset);
  baseReferenceSpace = teleportSpaceOffset;
  myPos.x = 0;
  myPos.y = 0;
  myPos.z = 0;
  myRot.x = 0;
  myRot.y = 0;
  myRot.z = 0;
}

function saveScene(event) {
  console.log(event);
  const link = document.createElement("a");
  function save(blob, filename) {
    if (link.href) {
      URL.revokeObjectURL(link.href);
    }

    link.href = URL.createObjectURL(blob);
    link.download = filename || "data.json";
    link.dispatchEvent(new MouseEvent("click"));
  }

  function saveString(text, filename) {
    save(new Blob([text], { type: "text/plain" }), filename);
  }

  if (true) {
    switch (event.key) {
      case "s":
        if (spheres) {
          spheres.geometry.dispose();
          spheres.material.dispose();
          scene.remove(spheres);
        }
        if (controller) {
          scene.remove(controller);
        }
        if (controller1) {
          scene.remove(controller1);
        }

        if (controller2) {
          scene.remove(controller2);
        }

        if (controllerGrip1) {
          //controllerGrip1.geometry.dispose();
          //controllerGrip1.material.dispose();
          scene.remove(controllerGrip1);
        }

        if (controllerGrip2) {
          //controllerGrip2.geometry.dispose();
          //controllerGrip2.material.dispose();
          scene.remove(controllerGrip2);
        }
        if (lineGroup) {
          lineGroup.traverse((lineGroup) => lineGroup.dispose?.());
          //lineGroup.geometry.dispose();
          //lineGroup.material.dispose();
          scene.remove(lineGroup);
        }

        if (reticle) {
          reticle.geometry.dispose();
          reticle.material.dispose();
          scene.remove(reticle);
        }

        const session = renderer.xr.getSession();
        var userID;
        if (session) {
          userID = userArray[0].id;
        } else {
          userID = userArray[1].id;
        }
        var con1 = "controller1";
        var con2 = "controller2";
        var dataCon1 = userID.concat(con1);
        var dataCon2 = userID.concat(con2);
        var cube = scene.getObjectByName(userID);
        var cubeCon1 = scene.getObjectByName(dataCon1);
        var cubeCon2 = scene.getObjectByName(dataCon2);
        scene.remove(cube);
        scene.remove(cubeCon1);
        scene.remove(cubeCon2);

        var con1 = "controller1";
        var con2 = "controller2";
        var dataCon1 = userID.concat(con1);
        var dataCon2 = userID.concat(con2);
        var cube = scene.getObjectByName(userID);
        var cubeCon1 = scene.getObjectByName(dataCon1);
        var cubeCon2 = scene.getObjectByName(dataCon2);
        scene.remove(cube);
        scene.remove(cubeCon1);
        scene.remove(cubeCon2);

        let output = scene.toJSON();

        try {
          output = JSON.stringify(output, null, "\t");
          output = output.replace(/[\n\t]+([\d\.e\-\[\]]+)/g, "$1");
        } catch (e) {
          output = JSON.stringify(output);
        }

        saveString(output, "scene.json");

        let outputRef = baseReferenceSpace;

        try {
          outputRef = JSON.stringify(outputRef, null, "\t");
          outputRef = outputRef.replace(/[\n\t]+([\d\.e\-\[\]]+)/g, "$1");
        } catch (e) {
          outputRef = JSON.stringify(outputRef);
        }

        // saveString(outputRef, "referenceSpace.json");

        break;
    }
  }
}

/////////////////////////
//   Rapier Physics   //
///////////////////////

function getCollider(geometry) {
  const parameters = geometry.parameters;

  // TODO change type to is*

  if (geometry.type === "BoxGeometry") {
    const sx = parameters.width !== undefined ? parameters.width / 2 : 0.5;
    const sy = parameters.height !== undefined ? parameters.height / 2 : 0.5;
    const sz = parameters.depth !== undefined ? parameters.depth / 2 : 0.5;

    return RAPIER.ColliderDesc.cuboid(sx, sy, sz);
  } else if (
    geometry.type === "SphereGeometry" ||
    geometry.type === "IcosahedronGeometry"
  ) {
    const radius = parameters.radius !== undefined ? parameters.radius : 1;
    return RAPIER.ColliderDesc.ball(radius);
  } else if (geometry.type === "BufferGeometry") {
    const vertices = new Float32Array(geometry.attributes.position.array);
    const indices = new Uint32Array(geometry.index.array);
    return RAPIER.ColliderDesc.trimesh(vertices, indices);
  }

  return null;
}

async function RapierPhysics() {
  if (RAPIER === null) {
    RAPIER = await import(RAPIER_PATH);
    await RAPIER.init();
  }

  // Docs: https://rapier.rs/docs/api/javascript/JavaScript3D/

  const gravity = new THREE.Vector3(0.0, -9.81, 0.0);
  const worldRapier = new RAPIER.World(gravity);

  const _vector = new THREE.Vector3();
  const _quaternion = new THREE.Quaternion();
  const _matrix = new THREE.Matrix4();

  function addMesh(mesh, mass = 0, restitution = 0, player) {
    const shape = getCollider(mesh.geometry);

    if (shape === null) return;

    shape.setMass(mass);
    shape.setRestitution(restitution);

    const body = mesh.isInstancedMesh
      ? createInstancedBody(mesh, mass, shape)
      : createBody(mesh.position, mesh.quaternion, mass, shape);

    if (mass > 0 || player === true) {
      meshes.push(mesh);
      meshMap.set(mesh, body);
    }
  }

  function createInstancedBody(mesh, mass, shape) {
    const array = mesh.instanceMatrix.array;

    const bodies = [];

    for (let i = 0; i < mesh.count; i++) {
      const position = _vector.fromArray(array, i * 16 + 12);
      bodies.push(createBody(position, null, mass, shape));
    }

    return bodies;
  }

  function createBody(position, quaternion, mass, shape) {
    const desc =
      mass > 0 ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
    desc.setTranslation(...position);
    if (quaternion !== null) desc.setRotation(quaternion);

    const body = worldRapier.createRigidBody(desc);
    worldRapier.createCollider(shape, body);

    return body;
  }

  function setMeshPosition(mesh, position, index = 0) {
    let body = meshMap.get(mesh);

    if (mesh.isInstancedMesh) {
      body = body[index];
    }

    body.setAngvel(ZERO);
    body.setLinvel(ZERO);
    body.setTranslation(position);
  }

  function setMeshVelocity(mesh, velocity, index = 0) {
    let body = meshMap.get(mesh);

    if (mesh.isInstancedMesh) {
      body = body[index];
    }

    body.setLinvel(velocity);
  }

  function setMeshPositionAndRotation(mesh, position, quaternion, index = 0) {
    let body = meshMap.get(mesh);

    if (mesh.isInstancedMesh) {
      body = body[index];
    }

    body.setAngvel(ZERO);
    body.setLinvel(ZERO);
    body.setTranslation(position);
    body.setRotation(quaternion);
  }

  const clock2 = new THREE.Clock();

  function step() {
    worldRapier.timestep = clock2.getDelta();
    let eventQueue = new RAPIER.EventQueue(true);
    worldRapier.step(eventQueue);
    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      console.log("eventQueue");
    });
    eventQueue.drainContactForceEvents((event) => {
      let handle1 = event.collider1(); // Handle of the first collider involved in the event.
      let handle2 = event.collider2(); // Handle of the second collider involved in the event.
      /* Handle the contact force event. */
      console.log("H1: " + handle1);
      console.log("H2: " + handle2);
    });
    //

    for (let i = 0, l = meshes.length; i < l; i++) {
      const mesh = meshes[i];

      if (mesh.isInstancedMesh) {
        const array = mesh.instanceMatrix.array;
        const bodies = meshMap.get(mesh);

        for (let j = 0; j < bodies.length; j++) {
          const body = bodies[j];

          const position = body.translation();
          _quaternion.copy(body.rotation());

          _matrix.compose(position, _quaternion, _scale).toArray(array, j * 16);
        }

        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      } else {
        const body = meshMap.get(mesh);
        mesh.position.copy(body.translation());
        mesh.quaternion.copy(body.rotation());
      }
    }
  }
  // animate

  setInterval(step, 1000 / frameRate);

  return {
    addMesh: addMesh,
    setMeshPosition: setMeshPosition,
    setMeshVelocity: setMeshVelocity,
    setMeshPositionAndRotation: setMeshPositionAndRotation,
  };
}

function exportScene() {
  const link = document.createElement("a");
  function save(blob, filename) {
    if (link.href) {
      URL.revokeObjectURL(link.href);
    }

    link.href = URL.createObjectURL(blob);
    link.download = filename || "data.json";
    link.dispatchEvent(new MouseEvent("click"));
  }

  function saveString(text, filename) {
    save(new Blob([text], { type: "text/plain" }), filename);
  }
  
  const clonedScene = cloneScene(scene);

  if (spheres) {
   // spheres.geometry.dispose();
   // spheres.material.dispose();
    clonedScene.remove(spheres);
  }
  if (controller) {
    clonedScene.remove(controller);
  }
  if (controller1) {
    clonedScene.remove(controller1);
  }

  if (controller2) {
    clonedScene.remove(controller2);
  }

  if (controllerGrip1) {
    //controllerGrip1.geometry.dispose();
    //controllerGrip1.material.dispose();
    clonedScene.remove(controllerGrip1);
  }

  if (controllerGrip2) {
    //controllerGrip2.geometry.dispose();
    //controllerGrip2.material.dispose();
    clonedScene.remove(controllerGrip2);
  }
  if (lineGroup) {
    lineGroup.traverse((lineGroup) => lineGroup.dispose?.());
    //lineGroup.geometry.dispose();
    //lineGroup.material.dispose();
    clonedScene.remove(lineGroup);
  }

  if (reticle) {
    //reticle.geometry.dispose();
    //reticle.material.dispose();
    clonedScene.remove(reticle);
  }

  let output = clonedScene.toJSON();

  try {
    output = JSON.stringify(output, null, "\t");
    output = output.replace(/[\n\t]+([\d\.e\-\[\]]+)/g, "$1");
  } catch (e) {
    output = JSON.stringify(output);
  }

  saveString(output, "scene.json");

  let outputRef = baseReferenceSpace;

  try {
    outputRef = JSON.stringify(outputRef, null, "\t");
    outputRef = outputRef.replace(/[\n\t]+([\d\.e\-\[\]]+)/g, "$1");
  } catch (e) {
    outputRef = JSON.stringify(outputRef);
  }

  // saveString(outputRef, "referenceSpace.json");
}

function cloneScene(originalScene) {
  const clonedScene = new THREE.Scene();

  // Clone objects from the original scene to the cloned scene
  originalScene.traverse((originalObject) => {
    if (originalObject.name == "Wireframe Mesh" || originalObject.name == "Plane") {
      const clonedObject = originalObject.clone();
      clonedScene.add(clonedObject);
    }
    // You can add additional checks and cloning logic for other object types like lights and cameras.
  });

  return clonedScene;
}
