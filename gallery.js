
//


import { WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Raycaster, Clock, Object3D, Mesh, Group, TextureLoader, AudioListener } from 'three'
import { Fog, AmbientLight, BufferGeometry, RingGeometry, MeshStandardMaterial, MeshBasicMaterial, Vector2, Vector3, DoubleSide, EquirectangularReflectionMapping, ACESFilmicToneMapping, AgXToneMapping, PCFSoftShadowMap, BasicShadowMap, LinearToneMapping, SRGBColorSpace } from "three";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { DotScreenShader } from 'three/addons/shaders/DotScreenShader.js'

import ModelLoader from './src/ModelLoader.js'
import { disposeSceneObjects, AudioHandler } from './src/utils.js';

import Visitor from './src/Visitor.js'
import JoyStick from './src/Joystick.js';

import Stats from "three/addons/libs/stats.module.js";
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import {
  acceleratedRaycast,
  disposeBoundsTree,
  computeBoundsTree,
} from 'three-mesh-bvh';


import TWEEN from 'three/addons/libs/tween.module.js';

const loader = new TextureLoader();

const params = {
  exhibitCollider: null,
  firstPerson: true,
  displayCollider: false, //true,
  visualizeDepth: 10,
  gravity: -70,
  visitorSpeed: 2,
  exposure: 1,
  gizmoVisible: false,
  canSeeGizmo: false,
  transControlsMode: "rotate",
  heightOffset: new Vector3(0, 0.33, 0),// offset the camera from the visitor
  archiveModelPath: "/models/nowy_exterior.glb",
  enablePostProcessing: true,
  isLowEndDevice: false,//navigator.hardwareConcurrency <= 4,
  transitionAnimate: true,
  transition: 0,

};

if (params.isLowEndDevice) alert('You are using a device with low capabilities. Some features will be unavailable, the aesthetic experience of the 3D world will be limited. Despite this, we strongly encourage you to explore the Blue Point Art Archive, because the most IMPORTANT thing is the ARTWORK, and you will find a lot of it here.');

//
const listener = new AudioListener();



const textureFolder = "/textures/";
let textureCache = {};

let renderer, camera, scene, clock, tween, stats, anisotropy;
let composer
let rendererMap, cameraMap, circleMap, sceneMap, css2DRenderer
const cameraDirection = new Vector3();

const ktx2Loader = new KTX2Loader()

let  visitor, controls, control;
let circle, circleYellow, circleBlue, circleTimeout, pulseScale, distance;
let environment = new Group();

let MapAnimationId = null;
let animationId = null;

const raycaster = new Raycaster();
let intersectedFloor0 = new Object3D();
intersectedFloor0.name = "FloorOut";

const lightsToTurn = [];
const audioObjects = [];
const visitorEnter = new Vector3();

const pointer = new Vector2();
const clickedPoint = new Vector3();
const visitorPos = new Vector3();
let video

//let audioHandler, exhibitModelPath//, exhibitModelPath0;

let deps = {};

Mesh.prototype.raycast = acceleratedRaycast;
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const gui = new GUI();
gui.show(false);


// Joystick 
const joystick = new JoyStick({
  canvas: document.getElementById("joystickCanvas")
});

joystick.onDirectionChange((data) => {
  const { direction } = data;

  switch (direction) {
    case 'up':
      visitor.fwdPressed = true;
      visitor.bkdPressed = false;
      break;
    case 'down':
      visitor.bkdPressed = true;
      visitor.fwdPressed = false;
      break;
    case 'left':
      visitor.lftPressed = true;
      visitor.rgtPressed = false;
      break;
    case 'right':
      visitor.rgtPressed = true;
      visitor.lftPressed = false;
      break;
    default:  // Stop moving when joystick is centered
      visitor.fwdPressed = false;
      visitor.bkdPressed = false;
      visitor.lftPressed = false;
      visitor.rgtPressed = false;
      break;
  }
});


console.log("isLowEndDevice: ", params.isLowEndDevice);


//
const waitForMe = async (millisec) => {
  await new Promise(resolve => requestAnimationFrame(time => resolve(time + millisec)));
};

//
const fadeOutEl = (el) => {
  el.style.animation = "fadeOut 2s forwards";
  el.addEventListener("animationend", () => {
    el.remove();
  });
};

init();


// init

function init() {

  // przeniesione z loadera100%
  let sidebar = document.querySelector(".sidebar");
  sidebar.style.display = "block";
  sidebar.style.animation = "fadeIn 2s forwards";
  //
  fadeOutEl(document.getElementById("overlay"));

  // renderer setup
  renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });


  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !params.isLowEndDevice;
  renderer.shadowMap.type = params.isLowEndDevice ? BasicShadowMap : PCFSoftShadowMap
  renderer.outputColorSpace = SRGBColorSpace;

  const isAppleDevice = false///Mac|iPad|iPhone|iPod/.test(navigator.userAgent);


  renderer.toneMapping = params.isLowEndDevice ? LinearToneMapping : (isAppleDevice ? AgXToneMapping : ACESFilmicToneMapping);
  renderer.toneMappingExposure = params.exposure;

  document.body.appendChild(renderer.domElement);

  anisotropy = renderer.capabilities.getMaxAnisotropy();

  ktx2Loader.setTranscoderPath('./libs/basis/').detectSupport(renderer);


  // scene setup
  scene = new Scene();


  // camera setup
  camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    70
  );
  camera.position.set(10, 6, -10);
  camera.updateProjectionMatrix();
  window.camera = camera;

  //audio on camera
  camera.add(listener);

  clock = new Clock();

  // orbit c
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 5, 0);

  controls.maxPolarAngle = Math.PI;
  controls.minDistance = 1e-4;
  controls.maxDistance = 1e-4;

  // transform c
  control = new TransformControls(camera, renderer.domElement);
  control.addEventListener("dragging-changed", function (event) {
    controls.enabled = !event.value;
  });

  //
  // CSS3DRenderer for DOM elements
  const innerWidth = 780,
    innerHeight = 800;


  // sceneMap
  sceneMap = new Scene();
  sceneMap.name = "sceneMap";
  sceneMap.scale.setScalar(25);
  sceneMap.rotation.x = Math.PI;
  sceneMap.rotation.y = Math.PI / 180;
  sceneMap.position.set(0, 0, 0);
  sceneMap.updateMatrixWorld(true);


  // camera
  cameraMap = new OrthographicCamera(
    innerWidth / -2,
    innerWidth / 2,
    innerHeight / 2,
    innerHeight / -2,
    0.1,
    10000
  );
  cameraMap.position.set(0, -50, 0);
  cameraMap.lookAt(new Vector3(0, 0, 0));


  //rendererMap = new WebGLRenderer();
  rendererMap = new WebGLRenderer();
  rendererMap.setClearColor(0x142236);
  document
    .querySelector("div#map_in_sidebar.info_sidebar")
    .appendChild(rendererMap.domElement);
  rendererMap.setSize(500, 500);


  // CSS2DRenderer for DOM elements
  css2DRenderer = new CSS2DRenderer();
  css2DRenderer.setSize(500, 500);
  css2DRenderer.domElement.style.position = 'absolute';
  css2DRenderer.domElement.style.top = '0';
  css2DRenderer.domElement.style.pointerEvents = 'none'; // Make sure it doesn't block interactions
  document.querySelector("div#map_in_sidebar.info_sidebar").appendChild(css2DRenderer.domElement);


  // AmbientLight MAP
  const light = new AmbientLight(0xffffff, 20); // soft white light
  sceneMap.add(light);




  // stats setup
  stats = new Stats();
  document.body.appendChild(stats.dom);


  const resetVisitor = () => {

    visitor.visitorVelocity.set(0, 0, 0)

    const targetV = visitor.target.clone()
    const circleMap = sceneMap.getObjectByName("circleMap");
    if (circleMap) {
      const targetVmap = visitor.target.clone()
      targetVmap.y + 100
      circleMap.position.copy(targetVmap);
    }

    targetV.y += 2;
    camera.position.sub(controls.target);
    controls.target.copy(targetV);
    camera.position.add(targetV);
    controls.update();

    visitor.position.copy(targetV);

    visitor.updateMatrixWorld(true);
  }

  //
  deps = {
    params,
    camera,
    control,
    controls,
    environment,
    renderer,
    ktx2Loader,
    gui,
    lightsToTurn,
    sceneMap,
    loader,
    listener,
    audioObjects,
    visitor,
    visitorEnter,
    TWEEN,
    anisotropy,
    animationId,
    resetVisitor: resetVisitor,
    mainSceneY: undefined,
  };

  visitor = new Visitor(deps);
  visitor.exhibitScene.name = 'exhibitScene';

  visitor.mainScene.fog = new Fog(0x2b0a07, 3.1, 18);

  const ambientLight = new AmbientLight(0xFFF9E3, 5);
  visitor.mainScene.add(ambientLight);

  visitor.position.set(0, 2, 0);
  visitor.visitorVelocity.set(0, -10, 0);

  visitor.mainScene.add(visitor)

  //
  addVisitorMapCircle();

  // composer
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(visitor.mainScene, camera));

  const effect1 = new ShaderPass(DotScreenShader);
  effect1.uniforms['scale'].value = 10;
  composer.addPass(effect1);


  // LOAD MODEL (environment, collider)

  const modelLoader = new ModelLoader(deps, visitor.parent);

  async function loadMainScene() {
    const scene = visitor.parent;

    const mainCollider = await modelLoader.loadModel(params.archiveModelPath);

    mainCollider.name = "mainCollider";

    deps.params.exhibitCollider = mainCollider;

    ktx2Loader.load("/textures/galaktyka.ktx2", (texture) => {

      texture.mapping = EquirectangularReflectionMapping;
      texture.colorSpace = SRGBColorSpace;

      scene.background = texture;
      scene.backgroundIntensity = 1;
      scene.backgroundBlurriness = 0;

    });

    animate();
  }

  loadMainScene();

  textureCache = preloadTextures();

  const loadingElement = document.getElementById('loading'); // Spinner container

  loadingElement.style.display = 'none';
  // events
  document
    .querySelector("img#audio-on")
    .addEventListener("pointerdown", (evt) => {
      evt.preventDefault();
      const intersectedFloor = visitor.checkLocation();
      const audioHandler = new AudioHandler();
      audioHandler.handleAudio(scene.getObjectByName(intersectedFloor.userData.audioToPlay));

    });

  // optimized raycaster after click
  let pressTimeout = null; // To track the long press timeout
  let isPressing = false; // To track if the pointer is currently down

  let isDragging = false; // To detect dragging
  let startX = 0; // Start X position of pointer
  let startY = 0; // Start Y position of pointer
  const MOVE_THRESHOLD = 5; // Pixels of movement to consider a drag

  const onPointerDown = (event) => {
    event.preventDefault(); // Prevent default behavior like highlighting on touch
  
    // Record the starting pointer position
    startX = event.clientX;
    startY = event.clientY;
    isDragging = false; // Reset dragging flag
  
    isPressing = true;
  
    // Start a timer for detecting a long press
    pressTimeout = setTimeout(() => {
      if (!isPressing || isDragging) return; // Cancel if dragging
  
      // Process the long press action
      const { clientX, clientY } = event;
      pointer.x = (clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  
      raycaster.setFromCamera(pointer, camera);
      raycaster.firstHitOnly = true;
  
      const intersects = raycaster.intersectObjects(visitor.scene.children);
  
      const validTypes = ['Image', 'visitorLocation', 'Room', 'Floor', 'Video'];
  
      const clickedObject = intersects.find(
        (intersect) =>
          intersect.object.userData &&
          validTypes.includes(intersect.object.userData.type)
      );
  
      if (clickedObject && clickedObject.object.userData) {
        switch (clickedObject.object.userData.type) {
          case 'Image':
            popupImage.src = clickedObject.object.userData.Map;
            popupDescription.textContent = clickedObject.object.userData.opis;
  
            // Add fade-in effect
            popup.style.opacity = "0"; // Start invisible
            popup.classList.add('show'); // Add 'show' class to prepare for fade-in
            popup.classList.remove('hidden'); // Ensure it's not hidden
  
            // Trigger fade-in using opacity
            setTimeout(() => {
              popup.style.opacity = "1"; // Fade to visible
            }, 5); // Small timeout to ensure CSS transition applies
  
            break;
  
          case 'Video':
            video = document.getElementById(clickedObject.object.userData.elementID);
            video.paused ? video.play() : video.pause();
            break;
  
          case 'Floor':
          case 'visitorLocation':
          case 'Room':
            const { distance, point } = clickedObject;
  
            circle = visitor.parent.getObjectByName('circle');
            if (!circle) addPointerCircle();
  
            clickedPoint.copy(point);
            visitorPos.copy(visitor.position.clone());
  
            clickedPoint.y = visitor.position.clone().y;
  
            circle.position.copy(point);
            circle.scale.set(1, 1, 1);
            circle.visible = true;
  
            tween = new TWEEN.Tween(visitorPos)
              .to(clickedPoint, (distance * 1000) / params.visitorSpeed)
              .onUpdate(() => {
                visitor.position.copy(visitorPos);
                visitor.updateMatrixWorld();
              })
              .onComplete(() => {
                circle.visible = false;
              });
  
            tween.start();
  
            const pulseTween = new TWEEN.Tween({ scale: 1 })
              .to({ scale: 0 }, 400)
              .repeat(Infinity)
              .yoyo(true)
              .onUpdate(({ scale }) => {
                circle.scale.set(scale, scale, scale);
              })
              .onStop(() => {
                circle.visible = false;
              });
  
            pulseTween.start();
            break;
  
          default:
            break;
        }
      }
    }, 300); // Adjust as needed
  };
  
  const onPointerMove = (event) => {
    // Detect if the pointer moves beyond the threshold
    if (Math.abs(event.clientX - startX) > MOVE_THRESHOLD || Math.abs(event.clientY - startY) > MOVE_THRESHOLD) {
      isDragging = true; // Mark as dragging
      clearTimeout(pressTimeout); // Cancel long-press timer if dragging
    }
  };

  const onPointerUp = () => {
    isPressing = false; // Reset pressing state
    clearTimeout(pressTimeout); // Clear the timeout if pointer is released early
  };

  // Add event listeners
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);


  // sidebar buttons events
  function handleSBbuttonsClick(divID) {
    //const isItMap = false;
    document.querySelectorAll(".info_sidebar").forEach((div) => {
      if (div.id === divID) {
        // Adds 'open' class if it doesn't have it, removes if it does
        div.classList.toggle("open");
      } else {
        // Makes sure other divs are hidden
        div.classList.remove("open");
      }
    });
  }

  document.addEventListener("onload", (e) => {
  });

  // open/close sb
  document.querySelector("#btn").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    document.querySelector(".sidebar").classList.toggle("open");
  });

  // info
  document.querySelector("#info-icon").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handleSBbuttonsClick(e.target.getAttribute("data-divid"));
  });

  // publications
  document.querySelector("#books-icon").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handleSBbuttonsClick(e.target.getAttribute("data-divid"));
  });

  // archive's map
  document.querySelector("#map-icon").addEventListener("pointerdown", (e) => {
    e.preventDefault();

    handleSBbuttonsClick(e.target.getAttribute("data-divid"));
    if (
      document
        .querySelector("li.text_in_sidebar div#map_in_sidebar.info_sidebar")
        .classList.contains("open")
    ) {
      animateMap();
    } else {
      if (MapAnimationId) {
        cancelAnimationFrame(MapAnimationId);
        MapAnimationId = null; // reset the id
      }
    }
  });
  // open BPA Gallery website
  document.querySelector("#bpa-icon").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    let newWindow = window.open();
    newWindow.location.assign("https://bluepointart.uk/");
  });

  //

  //////
 

  // Popup DOM elements
  const popup = document.querySelector('.modal-overlay');
  const closeBtn = document.querySelector('.modal-close');
  const popupImage = document.querySelector('.modal img');
  const popupDescription = document.querySelector('.modal-description');

  window.addEventListener("pointerdown", onPointerDown);

  // Close popup
  closeBtn.addEventListener('pointerdown', (event) => {
    event.stopPropagation();

    popup.classList.remove('show'); // Fade out
    setTimeout(() => {
      popup.classList.add('hidden'); // Hide after animation completes
    }, 400);

  });

  // Close modal when clicking outside of the modal content
  popup.addEventListener('pointerdown', (e) => {
    e.stopPropagation();

    if (e.target === modalOverlay) {
      popup.classList.remove('show'); // Fade out
      setTimeout(() => {
        popup.classList.add('hidden'); // Hide after animation completes
      }, 400); // Match the transition duration
    }
  });

  window.addEventListener(
    "resize",
    function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    false
  );


  // Key controls
  const keysPressed = {};

  const keyDownHandler = (event) => {
    keysPressed[event.key] = true;

    switch (event.key) {
      case "ArrowDown":
      case "s":
        visitor.bkdPressed = true;
        break;
      case "ArrowUp":
      case "w":
        visitor.fwdPressed = true;
        break;
      case "ArrowRight":
      case "d":
        visitor.rgtPressed = true;
        break;
      case "ArrowLeft":
      case "a":
        visitor.lftPressed = true;
        break;
      case " ":
        if (visitor.visitorIsOnGround) {
          deps.visitor.visitorVelocity.y = 20.0;
          visitor.visitorIsOnGround = false;
        }
        break;
      case "g":
        if (params.canSeeGizmo) {
          control._gizmo.visible = !control._gizmo.visible;
        }
        break;
      case "m":
        control.setMode("translate");
        break;
      case "r":
        control.setMode("rotate");
        break;
      case "t":

        break;
      case "Escape":
        control.reset();
        break;
    }
  };

  const keyUpHandler = (event) => {
    delete keysPressed[event.key];

    switch (event.key) {
      case "ArrowDown":
      case "s":
        visitor.bkdPressed = false;
        break;
      case "ArrowUp":
      case "w":
        visitor.fwdPressed = false;
        break;
      case "ArrowRight":
      case "d":
        visitor.rgtPressed = false;
        break;
      case "ArrowLeft":
      case "a":
        visitor.lftPressed = false;
        break;
    }
  };

  window.addEventListener("keydown", keyDownHandler);
  window.addEventListener("keyup", keyUpHandler);

}
//
// update visitor

function handleSceneBackground(deps) {
  const { bgTexture, bgBlur, bgInt } = deps;

  let cachedTexture = textureCache[bgTexture]

  const scene = visitor.parent;

  return new Promise((resolve, reject) => {

    if (cachedTexture) {

      cachedTexture.mapping = EquirectangularReflectionMapping;
      cachedTexture.colorSpace = SRGBColorSpace;

      // Set the scene background
      scene.background = cachedTexture;
      scene.backgroundIntensity = bgInt;
      scene.backgroundBlurriness = bgBlur;

      resolve(cachedTexture); // Resolve with the cached texture

    } else {

      console.error(`Texture not found in cache for: ${bgTexture}`);
      reject(new Error(`Texture not found in cache for: ${bgTexture}`));
    }
  });
}


async function updateVisitor(collider, delta) {


  const result = visitor.update(delta, collider, TWEEN);

  if (result.changed) {

    const newFloor = result.newFloor;

    let exhibitModelPath = newFloor.userData.exhibitModelPath;

    if (newFloor.name === "FloorOut") {


      visitor.moveToScene(visitor.mainScene, () => {
        disposeSceneObjects(visitor.exhibitScene);
        deps.params.exhibitCollider = visitor.parent.getObjectByName("mainCollider")

      });

    } else {

      const modelLoader = new ModelLoader(deps, visitor.exhibitScene, newFloor);

      visitor.exhibitScene.add(new AmbientLight(0x404040, 45));

      async function loadScene() {

        const collider = await modelLoader.loadModel(exhibitModelPath);

        collider.name = "exhibitCollider";

        deps.params.exhibitCollider = collider;
        deps.bgTexture = newFloor.userData.bgTexture || "public/textures/bg_color.ktx2";
        deps.bgInt = newFloor.userData.bgInt || 1;
        deps.bgBlur = newFloor.userData.bgBlur || 0;

        animate();
      }

      await loadScene();
      //
      visitor.moveToScene(visitor.exhibitScene)

      await handleSceneBackground(deps);

    }
    ///////////

    cancelAnimationFrame(deps.animationId);

    visitor.lastFloorName = newFloor.name;

    const { bgTexture = "textures/bg_color.ktx2" } = newFloor.userData;
    deps.bgTexture = bgTexture;
  }


}



function animateMap() {
  MapAnimationId = requestAnimationFrame(animateMap);

  camera.getWorldDirection(cameraDirection);
  const angle = Math.atan2(cameraDirection.x, cameraDirection.z);
  sceneMap.rotation.y = -angle + Math.PI;

  sceneMap.updateMatrixWorld();

  rendererMap.render(sceneMap, cameraMap);
  css2DRenderer.render(sceneMap, cameraMap);
}

//
function animate() {

  if (!deps.params.exhibitCollider) return

  const collider = deps.params.exhibitCollider;

  stats.update();
  TWEEN.update();  // Update all tweens globally


  const delta = Math.min(clock.getDelta(), 0.1);

  // Update visitor position and movement logic

  updateVisitor(collider, delta / 1);


  if (!visitor.parent) return;

  if (visitor.parent === visitor.mainScene) {
    composer.render();

  } else {
    renderer.render(visitor.parent, camera);

  }

  controls.update();
  deps.animationId = requestAnimationFrame(animate);
}



function addVisitorMapCircle() {

  // visitor Map
  circleMap = new Mesh(
    new RingGeometry(0.1, 1, 32),
    new MeshBasicMaterial({
      color: 0xbf011f,
      side: DoubleSide,
      transparent: true,
      opacity: 1,
    })
  );
  circleMap.position.copy(visitor.position);
  circleMap.position.y = visitor.position.y + 1000;
  circleMap.name = "circleMap";
  circleMap.rotation.x = (90 * Math.PI) / 180;
  circleMap.visible = true
  circleMap.material.depthWrite = true

  sceneMap.add(circleMap);

  //

}

function addPointerCircle() {
  /// circle (pointer)
  circle = new Group();
  circle.name = 'circle'
  circle.position.copy(visitor.position);
  circle.position.y = -30;

  circleYellow = new Mesh(
    new RingGeometry(0.1, 0.12, 32),
    new MeshBasicMaterial({
      color: 0xffcc00,
      side: DoubleSide,
      transparent: true,
      opacity: 0.5,
    })
  );
  circleYellow.rotation.x = (90 * Math.PI) / 180;
  circleYellow.name = "circleYellow";

  circleBlue = new Mesh(
    new RingGeometry(0.12, 0.14, 32),
    new MeshBasicMaterial({
      color: 0x0066cc,
      side: DoubleSide,
      transparent: true,
      opacity: 0.5,
    })
  );
  circleBlue.rotation.x = (90 * Math.PI) / 180;
  circle.add(circleYellow);
  circle.add(circleBlue);
  visitor.parent.add(circle);
}

//


//
function preloadTextures() {
  ktx2Loader.setTranscoderPath('./libs/basis/');
  ktx2Loader.detectSupport(renderer);

  // Cache to store textures
  const textureFiles = [
    'bg_color.ktx2',
    'galaktyka.ktx2',
    'equMap_podMostem.ktx2',
    'bg_white.ktx2',
    'bg_lockdowns.ktx2',
    'dystopia/bgVermeerViewofDelft.ktx2'
  ];

  // Iterate over the texture files and load each one
  textureFiles.forEach((textureFile) => {
    const textureUrl = textureFolder + textureFile;

    ktx2Loader.load(textureUrl, (texture) => {
      // Configure the texture and add it to the cache
      texture.mapping = EquirectangularReflectionMapping;
      texture.colorSpace = SRGBColorSpace;

      // Store in plain object using the URL as the key
      textureCache[textureUrl] = texture;

    });
  });

  return textureCache; // Return the cache for further use
}


