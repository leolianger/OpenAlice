# 构建 Docker 镜像并推送到 Docker Hub

本仓库（ OpenAlice fork）用于**构建并推送** Docker 镜像。Olares 的部署配置在单独工程 `terminus-apps/openalice` 中，仅通过 `values.yaml` 指定镜像地址拉取。

## 前置

- 已安装 Docker，并已 [注册 Docker Hub](https://hub.docker.com) 账户
- 本机已 `docker login`（使用 Docker ID 和密码或 Access Token）

## 构建与推送

在**本仓库根目录**执行（将 `YOUR_DOCKERHUB_USERNAME` 换成你的 Docker Hub 用户名）：

```bash
cd /home/leolianger/work/01_code/olares/OpenAlice

# 构建（基于当前目录源码）
docker build -t YOUR_DOCKERHUB_USERNAME/openalice:0.9.0-beta.6 .

# 推送到 Docker Hub
docker push YOUR_DOCKERHUB_USERNAME/openalice:0.9.0-beta.6
```

例如 Docker ID 为 `goai007` 时：

```bash
docker build -t goai007/openalice:0.9.0-beta.6 .
docker push goai007/openalice:0.9.0-beta.6
```

## 在 Olares 中使用

在 **terminus-apps** 工程中，编辑 `openalice/values.yaml`，设置上面推送的镜像：

```yaml
image:
  repository: docker.io/YOUR_DOCKERHUB_USERNAME/openalice   # 如 docker.io/goai007/openalice
  tag: "0.9.0-beta.6"
  pullPolicy: IfNotPresent
```

之后在 Olares 中部署 openalice 应用时，会从 Docker Hub 拉取该镜像。

## 更新镜像

修改本 fork 的代码后，重新构建并推送：

```bash
docker build -t goai007/openalice:0.9.0-beta.6 .
docker push goai007/openalice:0.9.0-beta.6
```

若使用新 tag（如 `0.9.0-beta.7`），需在 terminus-apps 的 `openalice/values.yaml` 中把 `image.tag` 改为对应版本。
