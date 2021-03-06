

CONFIG = {
    //'cameraControls': 'Orbit',
    gameOptions: {ambientLightIntensity: 2, headlightIntensity: 3},
    'specs': [
        {   type: 'Model', name: 'TDRS1',
            path: 'assets/models/satellites/TDRS1/TDRS1.dae',
            fitTo: {position: [0,0,0], size: 1}
        },
    ]
};

MUSE.returnValue(CONFIG);
