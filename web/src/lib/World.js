import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls';

class WorldRenderer {
    constructor(){
        this.canvas = document.createElement('canvas');
        this.width = 600;
        this.height = 300;

        
        this.mouse = new THREE.Vector2(0, 0);
        /*
        this.canvas.addEventListener('mousemove', (event) => {
            event.preventDefault();
            const x = event.clientX - this.canvas.getBoundingClientRect().left;
            const y = event.clientY - this.canvas.getBoundingClientRect().top;
            this.mouseMoved(x, y);
            //console.log(`mouse in canvas: ${x} ${y}`);
        });
        this.canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            const deltaX = event.deltaX;
            const deltaY = event.deltaY;
            this.mouseWheeled(deltaX, deltaY);
        });
        */

        this.renderer = new THREE.WebGLRenderer({canvas: this.canvas});
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
       
        // camera
        const FOV = 60;
        const camera_distance = (this.height/2) / Math.tan((FOV/2)*(Math.PI/180));
        
        //this.camera = new THREE.PerspectiveCamera(FOV, this.width/this.height, 1, camera_distance * 2);
        this.camera = new THREE.PerspectiveCamera(FOV, this.width/this.height, 1, 300);
        
        //this.camera.position.z = camera_distance;
        this.camera.position.z = 20;
        
        console.log(`render: canvas w:${this.canvas.width} h:${this.canvas.height}`);
        console.log(`render: camera pos ${this.camera.position.x} ${this.camera.position.y} ${this.camera.position.z}`);
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.2;

        this.scene = new THREE.Scene();
        
        const ambient = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambient);

        // light 
        this.light = new THREE.PointLight(0x00ffff);
        this.light.position.set(0, 0, 400);
        this.scene.add(this.light);

        // geometory
        const geo = new THREE.BoxGeometry(1,1,1);
        const mat = new THREE.MeshLambertMaterial({color: 0x4e98e2});
        this.mesh = new THREE.Mesh(geo, mat);
        //this.mesh.rotation.x = Math.PI / 2;
        this.scene.add(this.mesh);

        var geo1 = new THREE.BoxGeometry(1,1,1);
        var mat1 = new THREE.MeshLambertMaterial({color: 0xffffff});
        var mesh1 = new THREE.Mesh(geo1, mat1);
        mesh1.position.y = 10;
        //this.mesh.rotation.x = Math.PI / 2;
        this.scene.add(mesh1);

        const floor = new THREE.GridHelper(100, 100);
        floor.rotation.x = Math.PI / 2;
        this.scene.add(floor);

        this.renderer.render(this.scene, this.camera);
    }

    update(data){
        this.mesh.scale.set(4.933, 2.11, 1.48);
        
        
        this.mesh.position.x = data.position.x * 0.01;
        this.mesh.position.y = data.position.y * 0.01;
        
        /*
        //this.mesh.position.z = data.position.z;
        */
        
        this.camera.position.x = this.mesh.position.x;
        this.camera.position.y = this.mesh.position.y - 10;
        //this.camera.lookAt(new THREE.Vector3(this.mesh.position.x, this.mesh.position.y, 0));
        
        this.controls.target.set(this.mesh.position.x, this.mesh.position.y, 0);
        //this.camera.up.set(0,0,1);
        //this.controls.enableRotate = false;
        this.controls.update();
        //console.log(data);

        this.renderer.render(this.scene, this.camera);
    }

    mouseMoved(x, y){
        this.mouse.x = x - (this.width / 2);
        this.mouse.y = -y + (this.height / 2);

        this.light.position.x = this.mouse.x;
        this.light.position.y = this.mouse.y;
    }

    mouseWheeled(deltaX, deltaY){
        /*
        if(deltaY < 0){
            this.camera.position.z += 10.0;
        } else {
            this.camera.position.z -= 10.0;
        }
        */
        this.renderer.render(this.scene, this.camera);

        //console.log(`${deltaX}, ${deltaY}`);
        //console.log(`render: camera pos ${this.camera.position.x} ${this.camera.position.y} ${this.camera.position.z}`);

    }
}

export class WorldControl {
    constructor(){
        this.renderer = new WorldRenderer();
    }

    update(data){
        this.renderer.update(data);
    }
}

