import Worker from 'lib/chart_canvas.worker.js';

export class LineChartController {
    constructor(dataName, axisX, axisY, dataProvider) {
        this.dataName = dataName;
        this.axisX = axisX;
        this.axisY = axisY;
        this.dataProvider = dataProvider;
        this.timestamp = 0;
        this.data = {x:[], y:[]};
        this.plotData = [[-1,0],[0,0]];
        this.handler = null;

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
                title: {display: true, text: dataName},
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

        this.dataProvider.on(this.dataName, (data) => {
            this._prepareData(data.chartData);
            this.worker.postMessage({type: "render", data: this.data});
        });
    }

    setTimestamp(timestamp) {
        this.timestamp = timestamp;
    }

    getMessage() {
        this.dataProvider.sendData(this.dataName, {timestamp: this.timestamp});
        this.timestamp += 1;
    }

    _prepareData(data){
        if(this.data.x.length > 10){
            this.data.x.shift();
            this.data.y.shift();
        }
        this.data.x.push(data.x);
        this.data.y.push(data.y);
    }

    update(data) {
        this._prepareData(data);
        this.worker.postMessage({type: "render", data: this.data});
    }

    getDataName() {
        return this.dataName;
    }
}
