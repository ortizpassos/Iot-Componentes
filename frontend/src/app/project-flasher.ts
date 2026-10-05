import { ESPLoader, Transport } from 'esptool-js';
import SparkMD5 from 'spark-md5';
import { ProjectFirmware } from './project-store-model';
export async function flashProject(port: SerialPort, firmware: ProjectFirmware, files: { data: Uint8Array; address: number }[], log: (text: string) => void, progress: (value: number) => void, cancelled: () => boolean, manualBoot = false, stage: (text: string) => void = () => {}) {
  const transport = new Transport(port);
  let connected = false;
  log('Gravador: esptool-js 0.7.0 | modelo selecionado: ' + firmware.chip + ' | formato: ' + firmware.format);
  for (const file of files) log('BIN: ' + file.data.length + ' bytes no endereço 0x' + file.address.toString(16));
  try {
    const loader = new ESPLoader({ transport, baudrate: 115200, debugLogging: false, terminal: { clean: () => {}, writeLine: log, write: log } });
    // Two reset attempts cover both reset timings without seven silent retries.
    const connect = loader.connect.bind(loader);
    loader.connect = async (mode, _attempts, detecting) => {
      await connect(mode, 2, detecting);
      connected = true;
    };
    stage('Conectando ao ESP32. Se ficar aguardando, mantenha BOOT pressionado e pressione e solte EN/RESET.');
    try {
      await loader.main(manualBoot ? 'no_reset' : 'default_reset');
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
      if (error instanceof Error && /failed to open serial port|failed to execute 'open'|port is already open/i.test(error.message)) {
        throw new Error('Não foi possível abrir a porta USB. Ela pode estar ocupada ou desconectada. Feche o Monitor Serial/Plotter da IDE Arduino, outros programas e abas que usam a placa. Reconecte o cabo USB e selecione a porta novamente. Nenhum firmware foi gravado nesta tentativa.');
      }
      if (connected) throw new Error('A placa conectou, mas falhou ao preparar a gravação: ' + (error instanceof Error ? error.message : String(error)));
      throw new Error('Não foi possível conectar à placa. Feche o Monitor Serial e outros programas que usam a porta. Tente a conexão manual: segure BOOT, pressione e solte EN/RESET e solte BOOT; depois selecione a porta novamente. Verifique também o cabo USB de dados.');
    }
    stage('Placa conectada. Verificando modelo e memória...');
    if (loader.chip.CHIP_NAME !== firmware.chip) throw new Error('Modelo conectado: ' + loader.chip.CHIP_NAME + '. O firmware selecionado exige ' + firmware.chip + '. Nenhum arquivo foi gravado.');
    const bootOffset = loader.chip.BOOTLOADER_FLASH_OFFSET;
    const bootFile = files.find(f => f.address <= bootOffset && f.address + f.data.length > bootOffset + 24);
    if (!bootFile || bootFile.data[bootOffset - bootFile.address] !== 0xe9) throw new Error('O firmware não contém o bootloader esperado para esta placa. Solicite ao administrador o BIN completo ou os arquivos corretos.');
    for (const file of files) {
      const offset = firmware.format === 'MERGED' ? bootOffset : 0;
      if (file.data[offset] === 0xe9 && file.data.length >= offset + 24) {
        const chipId = file.data[offset + 12] | (file.data[offset + 13] << 8);
        if (chipId !== (loader.chip as typeof loader.chip & { IMAGE_CHIP_ID: number }).IMAGE_CHIP_ID) throw new Error('O arquivo BIN foi compilado para outro chip. Nenhum arquivo foi gravado.');
      }
    }
    stage('Identificando a capacidade da memória flash...');
    const detectedSize = await loader.detectFlashSize();
    if (!detectedSize) throw new Error('Não foi possível identificar a memória flash da placa. Nenhum firmware foi gravado. Reconecte a placa e verifique a alimentação e os periféricos conectados.');
    log('Memória flash identificada: ' + detectedSize);
    const match = /^(\d+)(MB|KB)$/.exec(detectedSize);
    const capacity = match ? Number(match[1]) * (match[2] === 'MB' ? 1048576 : 1024) : 0;
    if (!capacity || files.some(f => f.address + f.data.length > capacity)) throw new Error('O firmware não cabe na memória flash detectada: ' + detectedSize);
    if (cancelled()) throw new Error('Gravação cancelada antes de iniciar.');
    stage('Gravando e verificando o firmware. Não desconecte a placa.');
    await loader.writeFlash({ fileArray: files, flashMode: 'keep', flashFreq: 'keep', flashSize: 'keep', eraseAll: false, compress: true,
      calculateMD5Hash: data => SparkMD5.ArrayBuffer.hash(new Uint8Array(data).buffer),
      reportProgress: (index, written, total) => progress(Math.round((index + written / total) / files.length * 100)),
    });
    await loader.after('hard_reset');
    progress(100);
  } catch (error) {
    log('Falha na gravação: ' + (error instanceof Error ? error.message : String(error)));
    throw error;
  } finally { try { await transport.disconnect(); } catch {} }
}
