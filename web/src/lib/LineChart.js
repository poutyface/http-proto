import Worker from 'lib/chart_canvas.worker.js';

export class LineChartController {
    constructor(title, axisX, axisY) {
        this.dataName = title;
        this.axisX = axisX;
        this.axisY = axisY;
        this.data = {x:[], y:[]};

        const config = {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    cubicInterpolationMode: 'monotone',
                    lineTension: 0,
                    fill: false,
                    borderColor: "#4e98e2",
                    borderWidth: 1,
                    pointRadius: 1.5,
                }],
            },
            options: {
                title: {display: true, text: this.dataName},
                responsive: false,
                maintainAspectRatio: false,
                animation: false,
                legend: { display: false },
                hover: {
                    intersect: false,
                    mode: "x",
                },
                scales: {
                    yAxes: [{
                        display: true,
                        scaleLabel: {
                            display: true,
                            labelString: axisY,
                        },
                    }],
                    xAxes: [{
                        display: true,
                        scaleLabel: {
                            display: true,
                            labelString: axisX,
                        },                      
                    }],
                },
            },
        };

        this.worker = new Worker();
        this.canvas = document.createElement("canvas");
        this.canvas.width = 300;
        this.canvas.height = 150;
        const offscreen = this.canvas.transferControlToOffscreen();
        this.worker.postMessage({type: "initialize", config: config, canvas: offscreen}, [offscreen]);

    }

    drop(){
        this.worker.postMessage({type: "drop"});
        this.worker.terminate();
    }

    _prepareData(data){
        if(this.data.x.length > 10){
            this.data.x.shift();
            this.data.y.shift();
        }
        this.data.x.push(data.x.toFixed(2));
        this.data.y.push(data.y.toFixed(2));
    }

    update(data) {
        this._prepareData(data);
        this.worker.postMessage({type: "render", data: this.data});
    }

}
