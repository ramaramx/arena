// custom videotron geometry
AFRAME.registerComponent('a-shape', {
  schema: {
    // points will be parsed locally to a set of tuples, so this will become
      // [0,0],[3,0],[5,3],[3,5]
    points: {type: 'array', default: 
             [3,-2, -3,-2, -2,2, 2,2]
             // [0,0 , 1,1 , 2,2]
            }
  },
  init() {
    if (this.data.points % 2 !== 0) {
      console.warn("supplied odd number of points, will ignore last point")
    }
    
    let points = [];
    for (let i = 0; i < this.data.points.length; i+=2) {
      points.push(new THREE.Vector2(this.data.points[i], this.data.points[i+1]))
    }

    for (var i = 0; i < points.length; i++) {
      points[i].multiplyScalar(0.25);
    }
    
    var shape = new THREE.Shape(points);

    var geometry = new THREE.ShapeGeometry(shape);
    // var video = document.querySelector('#example-vid');
    // var texture = new THREE.VideoTexture( video )
    
    var material = new THREE.MeshBasicMaterial({
      color: 'white',
      shader: 'flat',
      side: 'double',
      transparent: true,
      // map: texture,
    });
    var mesh = new THREE.Mesh(geometry, material);
    this.el.object3D.add(mesh);
  },
});

/* hide on play */
AFRAME.registerComponent('hide-on-play',{
    schema:{type:'selector'},
    init:function(){
      this.onPlaying=this.onPlaying.bind(this);
      this.onPause=this.onPause.bind(this);
      this.el.object3D.visible=!this.data.playing;
    },
    play:function(){
      if(this.data){
        this.data.addEventListener('playing',this.onPlaying);
        this.data.addEventListener('pause',this.onPause);
      }
    },
    pause:function(){
      if(this.data){
        this.data.removeEventListener('playing',this.onPlaying);
        this.data.removeEventListener('pause',this.onPause);
      }
    },
    onPlaying:function(evt){
      this.el.object3D.visible=false;
    },
    onPause:function(evt){
      this.el.object3D.visible=true;
    }
  });

  /* click play video */
AFRAME.registerComponent('play-on-click',{
    init:function(){
      this.onClick=this.onClick.bind(this);
    },
    play:function(){
      window.addEventListener('click',this.onClick);
    },
    pause:function(){
      window.removeEventListener('click',this.onClick);
    },
    onClick:function(evt){
      var videoEl=this.el.getAttribute('material').src;
      if(!videoEl){
        return;
      }
      this.el.object3D.visible=true;
      videoEl.play();
    }
  });