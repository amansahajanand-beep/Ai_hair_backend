# API Documentation

## API Info

```bash
curl --location 'https://aihaircp.brainfungames.com/'
```

## Get All Categories

```bash
curl --location 'https://aihaircp.brainfungames.com/api/categories'
```

## Get All Images (optional filters and pagination)

```bash
curl --location 'https://aihaircp.brainfungames.com/api/images?category=women&subCategory=short&page=1&limit=20'
```

## Get Images By Category (path)

```bash
curl --location 'https://aihaircp.brainfungames.com/api/images/women'
```

## Get Images By Category And Sub Category (path)

```bash
curl --location 'https://aihaircp.brainfungames.com/api/images/women/short?page=1&limit=20'
```

## Get All Videos (optional category filter)

```bash
curl --location 'https://aihaircp.brainfungames.com/api/videos?category=women'
```

## Get Videos By Category (path)

```bash
curl --location 'https://aihaircp.brainfungames.com/api/videos/women'
```

## Get Image File

```bash
curl --location 'https://aihaircp.brainfungames.com/images/women/short/example.jpg'
```

## Generate Hairstyle

```bash
curl --location 'https://aihaircp.brainfungames.com/api/hairstyle' \
--form 'image=@"/path/to/photo.jpg"' \
--form 'device_id="device-123"' \
--form 'hair_style="LowFade"' \
--form 'color="blonde"'
```

## Generate Beard

```bash
curl --location 'https://aihaircp.brainfungames.com/api/hairstyle' \
--form 'image=@"/path/to/photo.jpg"' \
--form 'device_id="device-123"' \
--form 'beard_style="Goatee"'
```

## Check Daily Generation Limit

```bash
curl --location 'https://aihaircp.brainfungames.com/api/check-free-limit' \
--header 'Content-Type: application/json' \
--data '{
    "device_id": "device-123"
}'
```
