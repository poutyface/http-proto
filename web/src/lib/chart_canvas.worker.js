
// chart.js v3.0
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale} from 'chart.js'
Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale);

var offscreen = null;
var ctx = null;
var chart = null;

self.addEventListener('message', (event) => {
    if (event.data.type == 'initialize'){
        offscreen = event.data.canvas;
        ctx = offscreen.getContext("2d");
        chart = new Chart(ctx, event.data.config);
        return;
    }

    if (event.data.type == 'drop'){
        if(chart != null){
            chart.destroy();
            chart = null;
        }
        return;
    }

    if (chart == null){
        return;
    }

    chart.data.labels = event.data.data.x;
    chart.data.datasets[0].data = event.data.data.y;
    chart.update();
});