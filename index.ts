import './src/geofence'; // Il task va registrato prima del rendering, anche al risveglio in background.
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);