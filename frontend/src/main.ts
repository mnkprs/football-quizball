import { bootstrapApplication } from '@angular/platform-browser';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, Title, Tooltip, Legend } from 'chart.js';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Register Chart.js scales, controllers, and plugins required by analytics widgets
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend
);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
