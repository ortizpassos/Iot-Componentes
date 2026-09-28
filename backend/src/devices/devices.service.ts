import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateDeviceDto } from './dto/create-device.dto';
import { Device, DeviceDocument } from './schemas/device.schema';

@Injectable()
export class DevicesService {
  constructor(
    @InjectModel(Device.name)
    private readonly deviceModel: Model<DeviceDocument>,
  ) {}

  create(ownerId: string, dto: CreateDeviceDto) {
    return this.deviceModel.create({
      ...dto,
      owner: new Types.ObjectId(ownerId),
    });
  }

  findAll(ownerId: string) {
    return this.deviceModel.find({ owner: ownerId }).lean();
  }

  async findOne(ownerId: string, id: string) {
    const device = await this.deviceModel.findOne({ _id: id, owner: ownerId }).lean();
    if (!device) throw new NotFoundException('Dispositivo não encontrado.');
    return device;
  }

  async remove(ownerId: string, id: string) {
    const result = await this.deviceModel.deleteOne({ _id: id, owner: ownerId });
    if (!result.deletedCount) throw new NotFoundException('Dispositivo não encontrado.');
    return { deleted: true };
  }
}
