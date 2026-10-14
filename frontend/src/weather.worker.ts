import {
  spatialSupport,
  rasterize,
  forecastAtHour,
  type WeatherInit,
  type WeatherJob,
} from './weatherRaster';

let data: WeatherInit;
let view: WeatherJob['view'];
let support: ReturnType<typeof spatialSupport>;
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<WeatherInit | WeatherJob>) => void;
  postMessage: (value: unknown, transfer: Transferable[]) => void;
};
scope.onmessage = ({ data: message }) => {
  if ('corridor' in message) {
    data = message;
    return;
  }
  const started = performance.now();
  if (message.view) {
    view = message.view;
    support = spatialSupport(view.samples, view.width, view.height);
  }
  if (!view) return;
  const pixels = rasterize(
    support,
    data.corridor.map((cell) => forecastAtHour(cell.hours, message.hour)),
    data.load,
    data.rgb,
  );
  scope.postMessage(
    {
      id: message.id,
      width: view.width,
      height: view.height,
      pixels,
      duration: performance.now() - started,
      hour: message.hour,
    },
    [pixels.buffer],
  );
};
