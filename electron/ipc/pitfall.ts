import { ipcMain } from 'electron';
import { IpcChannels } from '../types';
import { pitfallService } from '../services/pitfall-service';

export function registerPitfallHandlers(): void {
  ipcMain.handle(IpcChannels.PITFALL_GET_OVERDUE, () => {
    return pitfallService.getOverdue();
  });
}
