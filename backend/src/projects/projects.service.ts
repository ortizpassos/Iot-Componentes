import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateProjectDto } from './dto/create-project.dto';
import { Project, ProjectDocument } from './schemas/project.schema';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
  ) {}

  create(ownerId: string, dto: CreateProjectDto) {
    const { deviceId, ...data } = dto;

    return this.projectModel.create({
      ...data,
      owner: new Types.ObjectId(ownerId),
      device: deviceId ? new Types.ObjectId(deviceId) : undefined,
    });
  }

  findAll(ownerId: string) {
    return this.projectModel
      .find({ owner: ownerId })
      .populate('device', 'name board model serialNumber')
      .lean();
  }

  async findOne(ownerId: string, id: string) {
    const project = await this.projectModel
      .findOne({ _id: id, owner: ownerId })
      .populate('device', 'name board model serialNumber')
      .lean();

    if (!project) throw new NotFoundException('Projeto não encontrado.');
    return project;
  }

  async remove(ownerId: string, id: string) {
    const result = await this.projectModel.deleteOne({ _id: id, owner: ownerId });
    if (!result.deletedCount) throw new NotFoundException('Projeto não encontrado.');
    return { deleted: true };
  }
}
