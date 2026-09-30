import { RegisterDto } from '../auth/dto/register.dto';
import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { ShipmentDto, ActiveDto, AdminDeviceDto, AdminListDto, AdminProjectDto, OrderStatusDto } from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get('access') access() { return { allowed: true }; }
  @Get('summary') summary() { return this.admin.summary(); }
  @Get('products') products(@Query() query: AdminListDto) { return this.admin.listProducts(query); }
  @Post('products') createProduct(@Body() dto: CreateProductDto) { return this.admin.createProduct(dto); }
  @Delete('products/:id') deleteProduct(@Param('id') id: string) { return this.admin.deleteProduct(id); }
  @Put('products/:id') updateProduct(@Param('id') id: string, @Body() dto: CreateProductDto) { return this.admin.updateProduct(id, dto); }
  @Patch('products/:id/active') productActive(@Param('id') id: string, @Body() dto: ActiveDto) { return this.admin.productActive(id, dto.active); }
  @Get('orders') orders(@Query() query: AdminListDto) { return this.admin.listOrders(query); }
  @Get('orders/:id') order(@Param('id') id: string) { return this.admin.order(id); }
  @Post('orders/:id/retry-print') retryPrint(@Param('id') id: string) { return this.admin.retryPrint(id); }
  @Post('orders/:id/ship') ship(@Param('id') id: string, @Body() dto: ShipmentDto) { return this.admin.shipOrder(id, dto.trackingCode); }
  @Post('orders/:id/issue-label') @Header('Cache-Control', 'no-store')
  issueLabel(@Param('id') id: string) { return this.admin.issueLabel(id); }
  @Get('orders/:id/shipping-label') @Header('Cache-Control', 'no-store')
  async label(@Param('id') id: string) { return new StreamableFile(await this.admin.label(id), { type: 'application/pdf', disposition: `attachment; filename="etiqueta-${id}.pdf"` }); }
  @Patch('orders/:id/status') orderStatus(@Param('id') id: string, @Body() dto: OrderStatusDto) { return this.admin.orderStatus(id, dto.status); }
  @Post('administrators') createAdmin(@Body() dto: RegisterDto) { return this.admin.createAdmin(dto); }
  @Get('administrators') administrators(@Query() query: AdminListDto) { return this.admin.listAdmins(query); }
  @Get('users') users(@Query() query: AdminListDto) { return this.admin.listUsers(query); }
  @Patch('users/:id/active') userActive(@Param('id') id: string, @Body() dto: ActiveDto) { return this.admin.userActive(id, dto.active); }
  @Get('devices') devices(@Query() query: AdminListDto) { return this.admin.listDevices(query); }
  @Post('devices') createDevice(@Body() dto: AdminDeviceDto) { return this.admin.saveDevice(dto); }
  @Put('devices/:id') updateDevice(@Param('id') id: string, @Body() dto: AdminDeviceDto) { return this.admin.saveDevice(dto, id); }
  @Get('projects') projects(@Query() query: AdminListDto) { return this.admin.listProjects(query); }
  @Post('projects') createProject(@Body() dto: AdminProjectDto) { return this.admin.saveProject(dto); }
  @Put('projects/:id') updateProject(@Param('id') id: string, @Body() dto: AdminProjectDto) { return this.admin.saveProject(dto, id); }
}
